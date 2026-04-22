import { Command } from "@langchain/langgraph";
import { isTracingEnabled, RootRunCapture, RUN_NAMES } from "../../langsmith.js";
import { activeRuns } from "../../active-runs.js";
import { NodeProgressEmitter } from "./emitter.js";
import { graph } from "../../graphs/scoring/scoring-graph-instance.js";
import { getCheckpointer } from "../../graphs/scoring/scoring-graph.js";
import type { ConfidentMatchContext, ExploringGapContext } from "../../types/api.js";
import { PublicMatchResponseSchema } from "../../types/public-response.js";

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

function mapFitAdvice(
  fitAdvice: Record<string, unknown> | undefined,
): { key: string; bulletPoints: string[] }[] {
  if (!fitAdvice) return [];
  switch (fitAdvice.scenarioId as string) {
    case "confirmed_fit":
      return [];
    case "invisible_expert":
      return [
        { key: "standout_strengths", bulletPoints: (fitAdvice.standoutStrengths as string[]) ?? [] },
        { key: "ats_reality_check",  bulletPoints: (fitAdvice.atsRealityCheck  as string[]) ?? [] },
        { key: "terminology_swaps",  bulletPoints: (fitAdvice.terminologySwaps  as string[]) ?? [] },
        { key: "keywords_to_add",    bulletPoints: (fitAdvice.keywordsToAdd    as string[]) ?? [] },
      ];
    case "narrative_gap":
      return [
        { key: "transferable_strengths", bulletPoints: (fitAdvice.transferableStrengths as string[]) ?? [] },
        { key: "reframing_suggestions",  bulletPoints: (fitAdvice.reframingSuggestions  as string[]) ?? [] },
        { key: "missing_skills",         bulletPoints: (fitAdvice.missingSkills         as string[]) ?? [] },
      ];
    case "honest_verdict": {
      const ack = fitAdvice.acknowledgement as string[] | null;
      return [
        { key: "honest_assessment", bulletPoints: (fitAdvice.honestAssessment as string[]) ?? [] },
        { key: "closing_steps",     bulletPoints: (fitAdvice.closingSteps     as string[]) ?? [] },
        ...(ack ? [{ key: "acknowledgement", bulletPoints: ack }] : []),
      ];
    }
    default:
      return [];
  }
}

function buildPublicResponse(
  state: Awaited<ReturnType<typeof graph.invoke>>,
  threadId: string,
  durationMs: number,
) {
  return {
    scenarioId: state.scenarioId!,
    fitScore: state.fitScore!,
    battleCard: {
      headline: state.headline!,
      bulletPoints: state.battleCardBullets ?? [],
    },
    fitAdvice: mapFitAdvice(state.fitAdvice),
    atsProfile: {
      atsScore: state.atsProfile?.atsScore ?? null,
      machineParsing: state.atsProfile?.machineParsing ?? [],
      machineRanking: state.atsProfile?.machineRanking ?? [],
    },
    scenarioSummary: { text: state.scenarioSummary ?? "" },
    threadId,
    _meta: { durationMs },
  };
}

async function emitResult(
  state: Awaited<ReturnType<typeof graph.invoke>>,
  emit: (eventName: string, data: object) => void,
  threadId: string,
  runStartTime: number,
  isInterrupted: boolean
) {
  if (isInterrupted) {
    emit("interrupted", {
      fitScore: state.fitScore ?? null,
      threadId,
    });
  } else {
    if (state.fitScore === undefined || !state.scenarioId) {
      emit("error", { error: "Incomplete graph result", message: "Graph completed but fitScore or scenarioId was not populated." });
      return;
    }
    if (!state.atsProfile) {
      throw new Error("runner: atsProfile missing after graph completion — atsAnalysis node did not write to state");
    }
    const durationMs = Date.now() - runStartTime;
    const response = buildPublicResponse(state, threadId, durationMs);
    const validated = PublicMatchResponseSchema.safeParse(response);
    if (!validated.success) {
      emit("error", {
        error: "Invalid response shape",
        message: "Graph output did not match PublicMatchResponseSchema.",
      });
      return;
    }
    emit("completed", { result: validated.data });
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
      await emitResult(state, emit, newThreadId, runStartTime, isInterrupted);
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
