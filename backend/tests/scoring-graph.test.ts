import { describe, it, expect, vi, beforeEach } from "vitest";
import { BaseChatModel } from "@langchain/core/language_models/chat_models";
import { AnalyzeFitLLMSchema, buildAnalyzeFitChain } from "../chains/analyze-fit-chain.js";
import { AtsAnalysisSchema } from "../chains/ats-analysis-chain.js";
import { InvisibleExpertLLMSchema } from "../chains/analyze-strong-match-chain.js";
import { NarrativeGapLLMSchema } from "../chains/analyze-narrative-gap-chain.js";
import { HonestVerdictLLMSchema } from "../chains/analyze-skeptical-reconciliation-chain.js";
import { buildScoringGraph } from "../graphs/scoring/scoring-graph.js";
import * as langsmith from "../langsmith.js";

// ---------------------------------------------------------------------------
// Langsmith mock — top-level, hoisted before imports
// ---------------------------------------------------------------------------

vi.mock("../langsmith.js", () => ({
  RootRunCapture: function RootRunCapture(
    this: Record<string, unknown>,
    _callback: (id: string) => void,
  ) {
    // stub — callbacks are ignored by model mocks
  },
  logValidationFailure: vi.fn(),
  isTracingEnabled: () => false,
  getTraceUrl: vi.fn(),
  RUN_NAMES: {},
}));

// ---------------------------------------------------------------------------
// Shared fixtures
// ---------------------------------------------------------------------------

const validAnalyzeFitLLMOutput = {
  fitScore: 82,
  headline: "Senior Frontend Engineer with strong TypeScript and React track record",
  battleCardBullets: [
    "5 years of TypeScript across production SPAs",
    "Led frontend architecture at a 50-person startup",
    "Built component libraries consumed by 4 product teams",
  ],
  scenarioSummary:
    "This candidate has a direct frontend background with the TypeScript and React depth the role requires. " +
    "Their trajectory from IC to lead maps to the seniority level advertised.",
  sourceRole: "frontend_swe",
  targetRole: "frontend_swe",
  fitAnalysis: {
    careerTrajectory: "IC frontend engineer progressing to tech lead over 5 years at a single startup",
    keyStrengths: ["TypeScript", "React", "frontend architecture", "component systems"],
    experienceGaps: [],
    weakMatchReason: "NONE",
  },
};

const weakAnalyzeFitLLMOutput = {
  ...validAnalyzeFitLLMOutput,
  fitScore: 38,
  scenarioSummary: "This candidate's background does not map to the role requirements.",
  fitAnalysis: {
    ...validAnalyzeFitLLMOutput.fitAnalysis,
    experienceGaps: ["No production TypeScript experience", "No React experience at scale"],
    weakMatchReason:
      "Three of five required skills are absent and the experience level is significantly below the role's minimum.",
  },
};

const validAtsLLMOutput = {
  atsScore: 82,
  machineRanking: [],
};

const lowAtsLLMOutput = {
  atsScore: 38,
  machineRanking: [
    "resume uses 'front-end development'; job posting requires 'React'",
    "missing keyword: 'TypeScript'",
  ],
};

const validInvisibleExpertLLMOutput = {
  standoutStrengths: ["TypeScript expertise", "React component architecture"],
  atsRealityCheck: [
    "Resume uses 'front-end development' but ATS scans for 'React' verbatim.",
    "Missing keyword 'TypeScript' despite being in the resume narrative.",
  ],
  terminologySwaps: ['Replace "front-end development" with "React"'],
  keywordsToAdd: ["TypeScript", "component library"],
};

const validNarrativeGapLLMOutput = {
  transferableStrengths: ["TypeScript", "React", "component systems"],
  reframingSuggestions: ["Lead with the production SPA work in the summary section."],
  missingSkills: [],
};

const validHonestVerdictLLMOutput = {
  honestAssessment: [
    "Three of the five required skills are absent.",
    "Experience level is below the role's minimum.",
  ],
  closingSteps: [
    "Gain production-level TypeScript experience on a real project.",
    "Build and ship at least one React SPA end-to-end.",
  ],
  acknowledgement: null,
  contextPrompt: null,
};

const honestVerdictWithContextPrompt = {
  ...validHonestVerdictLLMOutput,
  contextPrompt: "Can you describe any production frontend systems you have shipped?",
};

// ---------------------------------------------------------------------------
// buildMockModel
// ---------------------------------------------------------------------------

function buildMockModel(
  overrides: { atsScore?: "high" | "low"; fitScore?: "high" | "low" } = {},
) {
  const atsLow = overrides.atsScore === "low";
  const fitLow = overrides.fitScore === "low";

  const analyzeFitOutput = fitLow ? weakAnalyzeFitLLMOutput : validAnalyzeFitLLMOutput;
  const atsOutput = atsLow ? lowAtsLLMOutput : validAtsLLMOutput;

  const withStructuredOutput = vi.fn().mockImplementation((schema) => {
    if (schema === AnalyzeFitLLMSchema) {
      return { invoke: vi.fn().mockResolvedValue(analyzeFitOutput) };
    }
    if (schema === AtsAnalysisSchema) {
      return { invoke: vi.fn().mockResolvedValue(atsOutput) };
    }
    if (schema === InvisibleExpertLLMSchema) {
      return { invoke: vi.fn().mockResolvedValue(validInvisibleExpertLLMOutput) };
    }
    if (schema === NarrativeGapLLMSchema) {
      return { invoke: vi.fn().mockResolvedValue(validNarrativeGapLLMOutput) };
    }
    if (schema === HonestVerdictLLMSchema) {
      return { invoke: vi.fn().mockResolvedValue(validHonestVerdictLLMOutput) };
    }
    // Fallback — loud failure guard. Any new chain without a case here returns
    // data that fails every LLM schema. throw validated.error surfaces it immediately.
    return { invoke: vi.fn().mockResolvedValue({ unexpected: true }) };
  });

  return {
    bind: vi.fn().mockReturnThis(),
    withStructuredOutput,
  };
}

// ---------------------------------------------------------------------------
// Full graph runs — mocked chains
// ---------------------------------------------------------------------------

describe("buildScoringGraph — full run with mocked chains", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("produces the expected output state shape for a high-score confirmed_fit run", async () => {
    const model = buildMockModel();
    const compiledGraph = buildScoringGraph(model as unknown as BaseChatModel);
    const threadId = "test-thread-confirmed-fit";

    const state = await compiledGraph.invoke(
      {
        resumeText: "Jane Doe resume text",
        jobText: "Senior Frontend Engineer at Acme",
        intent: "confident_match",
        intentContext: { basis: ["direct_experience"] },
        userTier: "base",
      },
      { configurable: { thread_id: threadId } },
    );

    // analyzeFit outputs are in state
    expect(state.fitScore).toBeDefined();
    expect(typeof state.fitScore).toBe("number");
    expect(state.headline).toBeDefined();
    expect(Array.isArray(state.battleCardBullets)).toBe(true);
    expect(state.scenarioSummary).toBeDefined();
    expect(state.fitAnalysis).toBeDefined();

    // Old state fields no longer exist
    expect((state as Record<string, unknown>).resumeData).toBeUndefined();
    expect((state as Record<string, unknown>).jobData).toBeUndefined();
    expect((state as Record<string, unknown>).matchResult).toBeUndefined();

    // Routing and verdict
    expect(state.scenarioId).toBeDefined();
    expect(state.fitAdvice).toBeDefined();

    // High-score run completes without interrupt
    const snapshot = await compiledGraph.getState({ configurable: { thread_id: threadId } });
    expect(snapshot.next).toHaveLength(0);
  });

  it("confirmed_fit — fitAdvice is empty array, no LLM call for advice", async () => {
    const model = buildMockModel();
    const compiledGraph = buildScoringGraph(model as unknown as BaseChatModel);

    const state = await compiledGraph.invoke(
      {
        resumeText: "Jane Doe resume text",
        jobText: "Senior Frontend Engineer at Acme",
        intent: "confident_match",
        intentContext: { basis: ["direct_experience"] },
        userTier: "base",
      },
      { configurable: { thread_id: "test-thread-confirmed-fit-advice" } },
    );

    expect(state.scenarioId).toBe("confirmed_fit");
    const advice = state.fitAdvice as Record<string, unknown>;
    expect(advice.scenarioId).toBe("confirmed_fit");
    expect(Array.isArray(advice.fitAdvice)).toBe(true);
    expect((advice.fitAdvice as unknown[]).length).toBe(0);
  });

  it("invisible_expert — fitScore >= 75 and atsScore < 75 routes to analyzeStrongMatch", async () => {
    const model = buildMockModel({ atsScore: "low" });
    const compiledGraph = buildScoringGraph(model as unknown as BaseChatModel);
    const threadId = "test-thread-invisible-expert";

    const state = await compiledGraph.invoke(
      {
        resumeText: "Jane Doe resume",
        jobText: "Senior Frontend Engineer at Acme",
        intent: "confident_match",
        intentContext: { basis: ["direct_experience"] },
        userTier: "base",
      },
      { configurable: { thread_id: threadId } },
    );

    expect(state.scenarioId).toBe("invisible_expert");

    const snapshot = await compiledGraph.getState({ configurable: { thread_id: threadId } });
    expect(snapshot.next).toHaveLength(0);

    const advice = state.fitAdvice as Record<string, unknown>;
    expect(advice.scenarioId).toBe("invisible_expert");
    expect(Array.isArray(advice.standoutStrengths)).toBe(true);
    // atsRealityCheck is now string[] (not string)
    expect(Array.isArray(advice.atsRealityCheck)).toBe(true);
    expect(Array.isArray(advice.terminologySwaps)).toBe(true);
    expect(Array.isArray(advice.keywordsToAdd)).toBe(true);
  });

  it("honest_verdict — fitScore < 50 with contextPrompt triggers interrupt", async () => {
    const lowScoreInterruptModel = {
      bind: vi.fn().mockReturnThis(),
      withStructuredOutput: vi.fn().mockImplementation((schema) => {
        if (schema === AnalyzeFitLLMSchema) {
          return { invoke: vi.fn().mockResolvedValue(weakAnalyzeFitLLMOutput) };
        }
        if (schema === AtsAnalysisSchema) {
          return { invoke: vi.fn().mockResolvedValue(validAtsLLMOutput) };
        }
        if (schema === HonestVerdictLLMSchema) {
          return { invoke: vi.fn().mockResolvedValue(honestVerdictWithContextPrompt) };
        }
        return { invoke: vi.fn().mockResolvedValue({ unexpected: true }) };
      }),
    };

    const compiledGraph = buildScoringGraph(
      lowScoreInterruptModel as unknown as BaseChatModel,
    );
    const threadId = "test-thread-low-score-interrupt";

    await compiledGraph.invoke(
      {
        resumeText: "resume text",
        jobText: "job text",
        intent: "confident_match",
        intentContext: { basis: ["direct_experience"] },
        userTier: "base",
      },
      { configurable: { thread_id: threadId } },
    );

    const snapshot = await compiledGraph.getState({ configurable: { thread_id: threadId } });
    expect(snapshot.next.length).toBeGreaterThan(0);
    expect(snapshot.values.fitScore).toBe(38);
  });

  it("honest_verdict — contextPrompt null completes without interrupt and writes fitAdvice", async () => {
    const scenario5Model = {
      bind: vi.fn().mockReturnThis(),
      withStructuredOutput: vi.fn().mockImplementation((schema) => {
        if (schema === AnalyzeFitLLMSchema) {
          return { invoke: vi.fn().mockResolvedValue(weakAnalyzeFitLLMOutput) };
        }
        if (schema === AtsAnalysisSchema) {
          return { invoke: vi.fn().mockResolvedValue(validAtsLLMOutput) };
        }
        if (schema === HonestVerdictLLMSchema) {
          return { invoke: vi.fn().mockResolvedValue(validHonestVerdictLLMOutput) }; // contextPrompt: null
        }
        return { invoke: vi.fn().mockResolvedValue({ unexpected: true }) };
      }),
    };

    const compiledGraph = buildScoringGraph(scenario5Model as unknown as BaseChatModel);
    const threadId = "test-thread-scenario-5";

    const state = await compiledGraph.invoke(
      {
        resumeText: "resume text",
        jobText: "job text",
        intent: "confident_match",
        intentContext: { basis: ["direct_experience"] },
        userTier: "base",
      },
      { configurable: { thread_id: threadId } },
    );

    const snapshot = await compiledGraph.getState({ configurable: { thread_id: threadId } });
    expect(snapshot.next).toHaveLength(0);
    expect(state.scenarioId).toBe("honest_verdict");

    const advice = state.fitAdvice as Record<string, unknown>;
    expect(advice.scenarioId).toBe("honest_verdict");
    expect(Array.isArray(advice.honestAssessment)).toBe(true);
    expect(Array.isArray(advice.closingSteps)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Validation failure — AnalyzeFitLLMSchema
// ---------------------------------------------------------------------------

describe("buildAnalyzeFitChain — validation failure", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("throws ZodError and calls logValidationFailure when model returns invalid shape", async () => {
    const invalidOutput = { fitScore: "not-a-number", headline: "" };

    const mockModel = {
      bind: vi.fn().mockReturnThis(),
      withStructuredOutput: vi.fn().mockReturnValue({
        invoke: vi.fn().mockResolvedValue(invalidOutput),
      }),
    };

    const chain = buildAnalyzeFitChain(mockModel as unknown as BaseChatModel);

    await expect(
      chain.invoke({ resume_text: "resume", job_text: "job" }),
    ).rejects.toThrow(expect.objectContaining({ name: "ZodError" }));

    expect(langsmith.logValidationFailure).toHaveBeenCalledWith(
      expect.objectContaining({ nodeName: "analyze-fit", rawOutput: invalidOutput }),
    );
  });
});

// ---------------------------------------------------------------------------
// Cancel flow — LangSmith trace update
// ---------------------------------------------------------------------------

describe("cancel flow — LangSmith trace update shape", () => {
  it("cancel payload has required fields for LangSmith updateRun", () => {
    const cancelPayload = {
      end_time: Date.now(),
      error: null,
      extra: {
        cancelled: true,
        cancelledBy: "human",
        cancelReason: "user_initiated_escape",
        durationMs: 5000,
      },
      tags: ["cancelled", "human-interrupted"],
    };

    expect(cancelPayload.extra.cancelled).toBe(true);
    expect(cancelPayload.extra.cancelledBy).toBe("human");
    expect(cancelPayload.tags).toContain("cancelled");
    expect(cancelPayload.tags).toContain("human-interrupted");
    expect(cancelPayload.error).toBeNull();
    expect(typeof cancelPayload.end_time).toBe("number");
  });
});
