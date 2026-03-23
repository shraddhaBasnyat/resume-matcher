import { NextRequest, NextResponse } from "next/server";
import { ChatOllama } from "@langchain/ollama";
import { Command } from "@langchain/langgraph";
import { buildScoringGraph } from "@/lib/scoring-graph";
import { isTracingEnabled, getTraceUrl, RootRunCapture } from "@/lib/langsmith";
import { z } from "zod";

const model = new ChatOllama({ model: "llama3.2" });
const graph = buildScoringGraph(model);

const MatchRequestSchema = z.object({
  resumeText: z.string().min(1).max(100_000).optional(),
  jobText: z.string().min(1).max(100_000).optional(),
  humanContext: z.string().max(100_000).optional(),
  threadId: z.string().min(1).max(10_000).optional(),
});

export async function POST(request: NextRequest) {
  const requestStart = Date.now();

  try {
    const body = await request.json();
    const parseResult = MatchRequestSchema.safeParse(body);

    if (!parseResult.success) {
      return NextResponse.json(
        {
          error: "Invalid request body",
          details: parseResult.error.flatten(),
        },
        { status: 400 }
      );
    }

    const { resumeText, jobText, humanContext, threadId } = parseResult.data;
    const config = {
      configurable: { thread_id: threadId ?? crypto.randomUUID() },
    };

    const capture = isTracingEnabled() ? new RootRunCapture() : null;
    const invokeConfig = {
      ...config,
      runName: "resume-match-graph",
      metadata: {
        hasHumanContext: !!humanContext,
        isResume: true,
      },
      ...(capture ? { callbacks: [capture] } : {}),
    };

    let state;

    if (threadId && humanContext !== undefined) {
      // Resume from interrupt — human provided context (or accepted by passing empty string)
      state = await graph.invoke(new Command({ resume: humanContext }), invokeConfig);
    } else {
      if (!resumeText || !jobText) {
        return NextResponse.json(
          { error: "resumeText and jobText are required" },
          { status: 400 }
        );
      }
      state = await graph.invoke(
        { resumeText, jobText, humanContext: "" },
        invokeConfig
      );
    }

    const traceUrl =
      isTracingEnabled() && capture?.rootRunId ? getTraceUrl(capture.rootRunId) : null;

    // Check if the graph is paused at an interrupt
    const snapshot = await graph.getState(config);
    const isInterrupted = snapshot.next.length > 0;

    if (isInterrupted) {
      return NextResponse.json(
        {
          status: "interrupted",
          threadId: config.configurable.thread_id,
          partialResult: state.matchResult ?? null,
          message:
            "Score is below 60. Provide additional context about your experience to re-score.",
          _meta: { traceUrl, durationMs: Date.now() - requestStart },
        },
        { status: 202 }
      );
    }

    return NextResponse.json({
      status: "complete",
      threadId: config.configurable.thread_id,
      matchResult: state.matchResult,
      _meta: { traceUrl, durationMs: Date.now() - requestStart },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);

    if (
      message.includes("ECONNREFUSED") ||
      message.includes("fetch failed") ||
      message.includes("connect ECONNREFUSED")
    ) {
      return NextResponse.json(
        {
          error: "Ollama is unreachable",
          message:
            "Could not connect to Ollama. Make sure Ollama is running locally (`ollama serve`) and the llama3.2 model is pulled.",
        },
        { status: 503 }
      );
    }

    return NextResponse.json({ error: "Failed to score match", message }, { status: 500 });
  }
}
