import { NextRequest } from "next/server";
import { ChatOllama } from "@langchain/ollama";
import { Command } from "@langchain/langgraph";
import { BaseCallbackHandler } from "@langchain/core/callbacks/base";
import type { Serialized } from "@langchain/core/load/serializable";
import { buildScoringGraph } from "@/lib/scoring-graph";
import { isTracingEnabled, getTraceUrl, RootRunCapture, RUN_NAMES } from "@/lib/langsmith";
import { activeRuns } from "@/lib/active-runs";
import { z } from "zod";

const model = new ChatOllama({ model: "llama3.2" });
const graph = buildScoringGraph(model);

const MatchRequestSchema = z.object({
  resumeText: z.string().min(1).max(100_000).optional(),
  jobText: z.string().min(1).max(100_000).optional(),
  humanContext: z.string().max(100_000).optional(),
  threadId: z.string().min(1).max(10_000).optional(),
});

/** Node names that should trigger progress events in the SSE stream. */
const GRAPH_NODES = new Set(["parseResume", "parseJob", "scoreMatch", "gapAnalysis"]);

/** Callback handler that emits SSE node_start / node_done events. */
class NodeProgressEmitter extends BaseCallbackHandler {
  name = "node_progress_emitter";
  private nodeRuns = new Map<string, { name: string; startTime: number }>();

  constructor(private readonly emit: (eventName: string, data: object) => void) {
    super();
  }

  handleChainStart(
    _chain: Serialized,
    _inputs: Record<string, unknown>,
    runId: string,
    _parentRunId?: string,
    _tags?: string[],
    _metadata?: Record<string, unknown>,
    _runType?: string,
    name?: string
  ): void {
    if (!name || !GRAPH_NODES.has(name)) return;
    const ts = Date.now();
    this.nodeRuns.set(runId, { name, startTime: ts });
    this.emit("node_start", { node: name, timestamp: ts });
  }

  handleChainEnd(
    _outputs: Record<string, unknown>,
    runId: string
  ): void {
    const run = this.nodeRuns.get(runId);
    if (!run) return;
    const ts = Date.now();
    this.emit("node_done", { node: run.name, durationMs: ts - run.startTime, timestamp: ts });
    this.nodeRuns.delete(runId);
  }

  handleChainError(
    _error: Error,
    runId: string
  ): void {
    this.nodeRuns.delete(runId);
  }
}

export async function POST(request: NextRequest) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return new Response(
      JSON.stringify({ error: "Invalid JSON body" }),
      { status: 400, headers: { "Content-Type": "application/json" } }
    );
  }

  const parseResult = MatchRequestSchema.safeParse(body);
  if (!parseResult.success) {
    return new Response(
      JSON.stringify({ error: "Invalid request body", details: parseResult.error.flatten() }),
      { status: 400, headers: { "Content-Type": "application/json" } }
    );
  }

  const { resumeText, jobText, humanContext, threadId } = parseResult.data;

  // Validate: new run requires resumeText + jobText; resume run requires threadId
  const isResumeRun = !!(threadId && humanContext !== undefined);
  if (!isResumeRun && (!resumeText || !jobText)) {
    return new Response(
      JSON.stringify({ error: "resumeText and jobText are required for new runs" }),
      { status: 400, headers: { "Content-Type": "application/json" } }
    );
  }

  const encoder = new TextEncoder();
  // controller is assigned synchronously in ReadableStream start callback
  // eslint-disable-next-line prefer-const
  let controller!: ReadableStreamDefaultController<Uint8Array>;

  const readableStream = new ReadableStream<Uint8Array>({
    start(ctrl) {
      controller = ctrl;
    },
  });

  function emit(eventName: string, data: object) {
    try {
      controller.enqueue(
        encoder.encode(`event: ${eventName}\ndata: ${JSON.stringify(data)}\n\n`)
      );
    } catch {
      // Stream may already be closed
    }
  }

  // Run graph asynchronously — SSE events drive the client
  (async () => {
    const runStartTime = Date.now();
    const newThreadId = threadId ?? crypto.randomUUID();
    const config = { configurable: { thread_id: newThreadId } };

    const abortController = new AbortController();
    activeRuns.set(newThreadId, { abort: () => abortController.abort(), runStartTime });

    try {
      const progressEmitter = new NodeProgressEmitter(emit);
      const capture = isTracingEnabled()
        ? new RootRunCapture((rootRunId) => {
            emit("meta", { threadId: newThreadId, rootRunId, runStartTime });
          })
        : null;

      const runName = isResumeRun ? RUN_NAMES.HITL_RESUMED : "resume-match-graph";
      const invokeConfig = {
        ...config,
        runName,
        signal: abortController.signal,
        callbacks: [...(capture ? [capture] : []), progressEmitter],
      };

      let state;
      if (isResumeRun) {
        state = await graph.invoke(new Command({ resume: humanContext }), invokeConfig);
      } else {
        state = await graph.invoke(
          { resumeText: resumeText!, jobText: jobText!, humanContext: humanContext ?? "" },
          invokeConfig
        );
      }

      const traceUrl =
        isTracingEnabled() && capture?.rootRunId ? getTraceUrl(capture.rootRunId) : null;

      // Check if the graph is paused at an interrupt
      const snapshot = await graph.getState(config);
      const isInterrupted = snapshot.next.length > 0;

      if (isInterrupted) {
        emit("interrupted", {
          score: state.matchResult?.score ?? null,
          threadId: newThreadId,
        });
      } else {
        const { matchResult, resumeData, jobData } = state;
        emit("completed", {
          result: {
            score: matchResult!.score,
            matchedSkills: matchResult!.matchedSkills,
            missingSkills: matchResult!.missingSkills,
            narrativeAlignment: matchResult!.narrativeAlignment,
            gaps: matchResult!.gaps,
            resumeAdvice: matchResult!.resumeAdvice,
            weakMatch: matchResult!.weakMatch,
            weakMatchReason: matchResult!.weakMatchReason,
            resumeData,
            jobData,
            interrupted: false,
            threadId: newThreadId,
            _meta: {
              traceUrl,
              durationMs: Date.now() - runStartTime,
            },
          },
        });
      }
    } catch (error) {
      if (abortController.signal.aborted) {
        // Intentionally cancelled — don't emit an error event
        return;
      }
      const message = error instanceof Error ? error.message : String(error);
      if (
        message.includes("ECONNREFUSED") ||
        message.includes("fetch failed") ||
        message.includes("connect ECONNREFUSED")
      ) {
        emit("error", {
          error: "Ollama is unreachable",
          message:
            "Could not connect to Ollama. Make sure Ollama is running locally (`ollama serve`) and the llama3.2 model is pulled.",
        });
      } else {
        emit("error", { error: "Failed to score match", message });
      }
    } finally {
      activeRuns.delete(newThreadId);
      try { controller.close(); } catch { /* already closed */ }
    }
  })();

  return new Response(readableStream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}
