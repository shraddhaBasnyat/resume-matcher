import { Command } from "@langchain/langgraph";
import { isTracingEnabled, getTraceUrl, RootRunCapture, RUN_NAMES } from "@/lib/langsmith";
import { activeRuns } from "@/lib/active-runs";
import { NodeProgressEmitter } from "./emitter";
import { graph } from "./graph-instance";

export interface RunMatchGraphOptions {
  isResumeRun: boolean;
  resumeText?: string;
  jobText?: string;
  humanContext?: string;
  threadId?: string;
  emit: (eventName: string, data: object) => void;
  close: () => void;
  abort: AbortController;
}

export async function runMatchGraph({
  isResumeRun,
  resumeText,
  jobText,
  humanContext,
  threadId,
  emit,
  close,
  abort,
}: RunMatchGraphOptions): Promise<void> {
  const runStartTime = Date.now();
  const newThreadId = threadId ?? crypto.randomUUID();
  const config = { configurable: { thread_id: newThreadId } };

  activeRuns.set(newThreadId, { abort: () => abort.abort(), runStartTime });

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
      signal: abort.signal,
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
    if (abort.signal.aborted) {
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
    close();
  }
}
