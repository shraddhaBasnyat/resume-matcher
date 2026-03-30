import { Command } from "@langchain/langgraph";
import { isTracingEnabled, getTraceUrl, RootRunCapture, RUN_NAMES } from "@/lib/langsmith";
import { activeRuns } from "@/lib/active-runs";
import { NodeProgressEmitter } from "./emitter";
import { graph } from "./graph-instance";

type SharedOptions = {
  humanContext?: string;
  threadId?: string;
  emit: (eventName: string, data: object) => void;
  close: () => void;
  abort: AbortController;
};

type FreshRunOptions = SharedOptions & {
  kind: "fresh";
  resumeText: string;
  jobText: string;
};

type ResumeRunOptions = SharedOptions & {
  kind: "resume";
  humanContext: string;
  threadId: string;
};

export type RunMatchGraphOptions = FreshRunOptions | ResumeRunOptions;

function buildCallbacks(
  emit: (eventName: string, data: object) => void,
  threadId: string,
  runStartTime: number
) {
  const progressEmitter = new NodeProgressEmitter(emit);
  const capture = isTracingEnabled()
    ? new RootRunCapture((rootRunId) => {
        emit("meta", { threadId, rootRunId, runStartTime });
      })
    : null;
  return { callbacks: [...(capture ? [capture] : []), progressEmitter], capture };
}

async function invokeGraph(options: RunMatchGraphOptions, invokeConfig: Parameters<typeof graph.invoke>[1]) {
  if (options.kind === "resume") {
    return graph.invoke(new Command({ resume: options.humanContext }), invokeConfig);
  }
  return graph.invoke(
    { resumeText: options.resumeText, jobText: options.jobText, humanContext: options.humanContext ?? "" },
    invokeConfig
  );
}

async function emitResult(
  state: Awaited<ReturnType<typeof graph.invoke>>,
  emit: (eventName: string, data: object) => void,
  threadId: string,
  runStartTime: number,
  capture: RootRunCapture | null,
  isInterrupted: boolean
) {
  const traceUrl =
    isTracingEnabled() && capture?.rootRunId ? getTraceUrl(capture.rootRunId) : null;

  if (isInterrupted) {
    emit("interrupted", {
      score: state.matchResult?.score ?? null,
      threadId,
    });
  } else {
    const { matchResult, resumeData, jobData } = state;
    if (!matchResult) {
      emit("error", { error: "Incomplete graph result", message: "Graph completed but matchResult was not populated." });
      return;
    }
    emit("completed", {
      result: {
        ...matchResult,
        resumeData,
        jobData,
        interrupted: false,
        threadId,
        _meta: {
          traceUrl,
          durationMs: Date.now() - runStartTime,
        },
      },
    });
  }
}

function emitError(
  error: unknown,
  emit: (eventName: string, data: object) => void
) {
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
}

export async function runMatchGraph(options: RunMatchGraphOptions): Promise<void> {
  const { emit, close, abort } = options;
  const runStartTime = Date.now();
  const newThreadId = options.threadId ?? crypto.randomUUID();
  const config = { configurable: { thread_id: newThreadId } };

  activeRuns.set(newThreadId, { abort: () => abort.abort(), runStartTime });

  try {
    const { callbacks, capture } = buildCallbacks(emit, newThreadId, runStartTime);
    const runName = options.kind === "resume" ? RUN_NAMES.HITL_RESUMED : "resume-match-graph";
    const invokeConfig = { ...config, runName, signal: abort.signal, callbacks };

    const state = await invokeGraph(options, invokeConfig);
    const snapshot = await graph.getState(config);
    const isInterrupted = snapshot.next.length > 0;
    await emitResult(state, emit, newThreadId, runStartTime, capture, isInterrupted);
  } catch (error) {
    if (abort.signal.aborted) {
      // Intentionally cancelled — don't emit an error event
      return;
    }
    emitError(error, emit);
  } finally {
    activeRuns.delete(newThreadId);
    close();
  }
}
