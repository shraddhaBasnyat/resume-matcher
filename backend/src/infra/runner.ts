import { Command } from "@langchain/langgraph";
import { activeRuns } from "../../active-runs.js";
import { NodeProgressEmitter } from "./emitter.js";
import { graph } from "../../graphs/scoring/scoring-graph-instance.js";
import { getCheckpointer } from "../../graphs/scoring/scoring-graph.js";
import type { ConfidentMatchContext, ExploringGapContext } from "../../types/api.js";
import { PublicMatchResponseSchema } from "../../types/public-response.js";
import type { EvidenceItem, ReframingItem, TaggedItem } from "../../types/fit-advice.js";

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

function buildCallbacks(emit: (eventName: string, data: object) => void) {
  const progressEmitter = new NodeProgressEmitter(emit);
  return { callbacks: [progressEmitter] };
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

function toEvidenceItem(text: string, index: number): EvidenceItem {
  const [label, ...rest] = text.split(" — ");
  return {
    label:      label?.trim() ?? text,
    detail:     rest.join(" — ").trim() || text,
    confidence: index === 0 ? "high" : "medium",
  };
}

function toTaggedItem(text: string, index: number, total: number): TaggedItem {
  return {
    severity: index < Math.ceil(total / 2) ? "material" : "notable",
    text,
  };
}

function mapFitAdvice(
  fitAdvice: Record<string, unknown> | undefined,
): { key: string; items: EvidenceItem[] | ReframingItem[] | TaggedItem[] }[] {
  if (!fitAdvice) return [];
  switch (fitAdvice.scenarioId as string) {
    case "confirmed_fit":
      return [
        { key: "lead_with_these",        items: ((fitAdvice.leadWithThese        as string[]) ?? []).map(toEvidenceItem) },
        { key: "expect_these_questions", items: ((fitAdvice.expectTheseQuestions as string[]) ?? []).map(toEvidenceItem) },
        { key: "watch_out_for",          items: ((fitAdvice.watchOutFor          as string[]) ?? []).map(toEvidenceItem) },
      ];
    case "invisible_expert":
      return [
        { key: "standout_strengths", items: ((fitAdvice.standoutStrengths as string[])    ?? []).map(toEvidenceItem) },
        { key: "ats_reality_check",  items: ((fitAdvice.atsRealityCheck  as string[])     ?? []).map(toEvidenceItem) },
        { key: "terminology_swaps",  items:  (fitAdvice.terminologySwaps as ReframingItem[]) ?? []                   },
        { key: "keywords_to_add",    items: ((fitAdvice.keywordsToAdd    as string[])     ?? []).map((t, i, arr) => toTaggedItem(t, i, arr.length)) },
      ];
    case "narrative_gap":
      return [
        { key: "reframing_suggestions",  items:  (fitAdvice.reframingSuggestions  as ReframingItem[]) ?? []                 },
        { key: "missing_skills",         items: ((fitAdvice.missingSkills         as string[])    ?? []).map((t, i, arr) => toTaggedItem(t, i, arr.length)) },
      ];
    case "honest_verdict": {
      const ack = fitAdvice.acknowledgement as string[] | null;
      return [
        { key: "honest_assessment", items: ((fitAdvice.honestAssessment as string[]) ?? []).map(toEvidenceItem) },
        { key: "closing_steps",     items: ((fitAdvice.closingSteps     as string[]) ?? []).map((t, i, arr) => toTaggedItem(t, i, arr.length)) },
        ...(ack ? [{ key: "acknowledgement", items: ack.map(toEvidenceItem) }] : []),
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
      bullets: state.battleCardBullets ?? [],
    },
    fitAdvice: mapFitAdvice(state.fitAdvice),
    atsScore: state.atsScore ?? null,
    threadId,
    _meta: { durationMs },
  };
}

async function emitResult(
  state: Awaited<ReturnType<typeof graph.invoke>>,
  emit: (eventName: string, data: object) => void,
  threadId: string,
  runStartTime: number,
  isInterrupted: boolean,
  contextPrompt: string | null = null,
) {
  if (isInterrupted) {
    emit("interrupted", {
      fitScore: state.fitScore ?? null,
      threadId,
      contextPrompt,
    });
  } else {
    if (state.fitScore === undefined || !state.scenarioId) {
      emit("error", { error: "Incomplete graph result", message: "Graph completed but fitScore or scenarioId was not populated." });
      return;
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
  emit("meta", { threadId: newThreadId, runStartTime });

  try {
    const { callbacks } = buildCallbacks(emit);
    const invokeConfig = {
      ...config,
      signal: abort.signal,
      callbacks,
      runName: options.kind === "resume" ? "jobinit-match-graph: hitl-resumed" : "jobinit-match-graph",
    };

    const state = await invokeGraph(options, invokeConfig);
    const snapshot = await graph.getState(config);
    const isInterrupted = snapshot.next.length > 0;
    const contextPrompt = isInterrupted
      ? ((snapshot.tasks[0]?.interrupts[0]?.value as string) ?? null)
      : null;
    try {
      await emitResult(state, emit, newThreadId, runStartTime, isInterrupted, contextPrompt);
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
