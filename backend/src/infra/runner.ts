import { Command } from "@langchain/langgraph";
import { isTracingEnabled, getTraceUrl, RootRunCapture, RUN_NAMES } from "../../langsmith.js";
import { activeRuns } from "../../active-runs.js";
import { NodeProgressEmitter } from "./emitter.js";
import { graph } from "../../graphs/scoring/scoring-graph-instance.js";
import { getCheckpointer } from "../../graphs/scoring/scoring-graph.js";
import type { ConfidentMatchContext, ExploringGapContext } from "../../types/api.js";

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
  intent: "confident_match" | "exploring_gap";
  intentContext: ConfidentMatchContext | ExploringGapContext;
};

type ResumeRunOptions = SharedOptions & {
  kind: "resume";
  humanContext: string;
  threadId: string;
};

type AcceptRunOptions = Omit<SharedOptions, "threadId"> & {
  kind: "accept";
  threadId: string;
};

export type RunMatchGraphOptions = FreshRunOptions | ResumeRunOptions | AcceptRunOptions;

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

async function invokeGraph(options: FreshRunOptions | ResumeRunOptions, invokeConfig: Parameters<typeof graph.invoke>[1]) {
  if (options.kind === "resume") {
    return graph.invoke(new Command({ resume: options.humanContext }), invokeConfig);
  }
  return graph.invoke(
    {
      resumeText: options.resumeText,
      jobText: options.jobText,
      intent: options.intent,
      intentContext: options.intentContext,
      userTier: "base", // hardcoded until auth middleware lands in Pass 2
    },
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
      fitScore: state.matchResult?.fitScore ?? null,
      contextPrompt: state.matchResult?.contextPrompt ?? null,
      threadId,
    });
  } else {
    const { matchResult } = state;
    if (!matchResult) {
      emit("error", { error: "Incomplete graph result", message: "Graph completed but matchResult was not populated." });
      return;
    }
    if (!state.atsProfile) {
      throw new Error("runner: atsProfile missing after graph completion — atsAnalysis node did not write to state");
    }
    // Explicit field list — resumeData and jobData are internal graph state only,
    // not surfaced to the client.
    emit("completed", {
      result: {
        fitScore: matchResult.fitScore,
        matchedSkills: matchResult.matchedSkills,
        missingSkills: matchResult.missingSkills,
        narrativeAlignment: matchResult.narrativeAlignment,
        weakMatch: matchResult.weakMatch,
        weakMatchReason: matchResult.weakMatchReason,
        atsProfile: state.atsProfile,
        fitAdvice: state.fitAdvice ?? null,
        scenarioId: state.scenarioId,
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
  const { emit, close } = options;
  const runStartTime = Date.now();

  // Accept: read existing state from checkpointer and emit — no graph invocation
  if (options.kind === "accept") {
    try {
      const config = { configurable: { thread_id: options.threadId } };
      const snapshot = await graph.getState(config);
      await emitResult(
        snapshot.values as Awaited<ReturnType<typeof graph.invoke>>,
        emit,
        options.threadId,
        runStartTime,
        null,
        false
      );
      await getCheckpointer().deleteThread(options.threadId);
    } catch (error) {
      emitError(error, emit);
    } finally {
      close();
    }
    return;
  }

  const { abort } = options;
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
    try {
      await emitResult(state, emit, newThreadId, runStartTime, capture, isInterrupted);
    } finally {
      if (!isInterrupted) {
        await getCheckpointer().deleteThread(newThreadId);
      }
    }
  } catch (error) {
    if (abort.signal.aborted) {
      // Intentionally cancelled — don't emit an error event
      await getCheckpointer().deleteThread(newThreadId);
      return;
    }
    emitError(error, emit);
  } finally {
    activeRuns.delete(newThreadId);
    close();
  }
}
