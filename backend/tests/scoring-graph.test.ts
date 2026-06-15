import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { BaseChatModel } from "@langchain/core/language_models/chat_models";
import { FakeListChatModel } from "@langchain/core/utils/testing";
import { RunnableLambda } from "@langchain/core/runnables";
import { AnalyzeFitLLMSchema, buildAnalyzeFitRunnable } from "../llm-wrappers/analyze-fit.wrapper.js";
import { AtsAnalysisSchema, buildAtsAnalysisRunnable } from "../llm-wrappers/ats-analysis.wrapper.js";
import { InvisibleExpertLLMSchema } from "../llm-wrappers/analyze-strong-match.wrapper.js";
import { NarrativeGapLLMSchema } from "../llm-wrappers/analyze-narrative-gap.wrapper.js";
import { HonestVerdictLLMSchema } from "../llm-wrappers/analyze-skeptical-reconciliation.wrapper.js";
import { buildScoringGraph } from "../graphs/scoring/scoring-graph.js";

class SchemaAwareFakeChatModel extends FakeListChatModel {
  constructor(private readonly responsesBySchema: Map<unknown, unknown>) {
    super({ responses: ["{}"] });
  }
  override withStructuredOutput(schema: unknown) {
    const response = this.responsesBySchema.get(schema) ?? { unexpected: true };
    return RunnableLambda.from(async () => response);
  }
}

// ---------------------------------------------------------------------------
// Shared fixtures
// ---------------------------------------------------------------------------

const validAnalyzeFitLLMOutput = {
  fitScore: 82,
  headline: "Senior Frontend Engineer with strong TypeScript and React track record",
  battleCardBullets: [
    { requirement: "TypeScript depth", evidence: "5 years of TypeScript across production SPAs", verdict: "strong_match" as const },
    { requirement: "Architecture leadership", evidence: "Led frontend architecture at a 50-person startup", verdict: "strong_match" as const },
    { requirement: "Component system design", evidence: "Built component libraries consumed by 4 product teams", verdict: "strong_match" as const },
  ],
  fitScenarioSummary:
    "This candidate has a direct frontend background with the TypeScript and React depth the role requires. " +
    "Their trajectory from IC to lead maps to the seniority level advertised.",
  fitAha: "Five years of TypeScript across production SPAs maps directly to what this role requires.",
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
  fitScenarioSummary: "This candidate's background does not map to the role requirements.",
  fitAha: "The core required skills are absent — this is a genuine gap, not a framing problem.",
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
  atsScenarioSummary: "Resume is parseable with clean formatting. No knockout risks. Good keyword coverage.",
  atsAha: "Keyword coverage is strong — the machine picture is not a barrier here.",
};

const lowAtsLLMOutput = {
  atsScore: 38,
  machineRanking: [
    "resume uses 'front-end development'; job posting requires 'React'",
    "missing keyword: 'TypeScript'",
  ],
  atsScenarioSummary: "Resume uses different terminology than the job posting requires. Missing two of the four key search terms.",
  atsAha: "Resume uses 'front-end development' but ATS filters for 'React' — a translation problem, not a talent gap.",
};

const validInvisibleExpertLLMOutput = {
  standoutStrengths: ["TypeScript expertise", "React component architecture"],
  atsRealityCheck: [
    "Resume uses 'front-end development' but ATS scans for 'React' verbatim.",
    "Missing keyword 'TypeScript' despite being in the resume narrative.",
  ],
  terminologySwaps: [{ before: "front-end development", after: "React", reason: "ATS scans for 'React' verbatim — exact term match required." }],
  keywordsToAdd: ["TypeScript", "component library"],
  leadWithThese: [],
  expectTheseQuestions: [],
  watchOutFor: [],
  closingSummary: "Your background is exactly what this role needs — the gap is in how your resume reads to machines, not to humans.",
  verdictAha: "Your reframing cards show exactly how to retell the experience as the machine expects to read it.",
};

const validNarrativeGapLLMOutput = {
  transferableStrengths: ["TypeScript", "React", "component systems"],
  reframingSuggestions: [{ before: "summary section", after: "production SPA work lead", reason: "Leads with the strongest signal for this role." }],
  missingSkills: [],
  closingSummary: "The experience is right — the framing is wrong. Your SPA work maps directly once retold in the role's terms.",
  verdictAha: "Start with the reframing cards — once the framing is fixed, the score follows.",
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
  closingSummary: "The gap is real and the score stands. Three of the five required skills are absent — this is a 12–18 month gap to close.",
  verdictAha: "The honest assessment cards explain specifically why — start there before deciding whether to apply.",
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

  return new SchemaAwareFakeChatModel(new Map<unknown, unknown>([
    [AnalyzeFitLLMSchema, analyzeFitOutput],
    [AtsAnalysisSchema, atsOutput],
    [InvisibleExpertLLMSchema, validInvisibleExpertLLMOutput],
    [NarrativeGapLLMSchema, validNarrativeGapLLMOutput],
    [HonestVerdictLLMSchema, validHonestVerdictLLMOutput],
  ]));
}

// ---------------------------------------------------------------------------
// Full graph runs — mocked chains
// ---------------------------------------------------------------------------

describe("buildScoringGraph — full run with mocked chains", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
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
    expect(state.fitScenarioSummary).toBeDefined();
    expect(state.fitAha).toBeDefined();
    expect(state.atsScenarioSummary).toBeDefined();
    expect(state.atsAha).toBeDefined();
    expect(state.closingSummary).toBeDefined();
    expect(state.verdictAha).toBeDefined();
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

  it("confirmed_fit — fitAdvice is empty array, closingSummary and verdictAha in state", async () => {
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
    // Interview prep fields are present (empty arrays from mock fixture, correct shape)
    expect(Array.isArray(advice.leadWithThese)).toBe(true);
    expect(Array.isArray(advice.expectTheseQuestions)).toBe(true);
    expect(Array.isArray(advice.watchOutFor)).toBe(true);
    expect(state.closingSummary).toBeDefined();
    expect(state.verdictAha).toBeDefined();
    // ATS advice fields must NOT appear in fitAdvice for confirmed_fit
    expect(advice.standoutStrengths).toBeUndefined();
    expect(advice.atsRealityCheck).toBeUndefined();
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
    const lowScoreInterruptModel = new SchemaAwareFakeChatModel(new Map<unknown, unknown>([
      [AnalyzeFitLLMSchema, weakAnalyzeFitLLMOutput],
      [AtsAnalysisSchema, validAtsLLMOutput],
      [HonestVerdictLLMSchema, honestVerdictWithContextPrompt],
    ]));

    const compiledGraph = buildScoringGraph(lowScoreInterruptModel);
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
    const scenario5Model = new SchemaAwareFakeChatModel(new Map<unknown, unknown>([
      [AnalyzeFitLLMSchema, weakAnalyzeFitLLMOutput],
      [AtsAnalysisSchema, validAtsLLMOutput],
      [HonestVerdictLLMSchema, validHonestVerdictLLMOutput], // contextPrompt: null
    ]));

    const compiledGraph = buildScoringGraph(scenario5Model);
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

describe("AnalyzeFitRunnable — validation failure", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("logs console.error and throws ZodError when model returns invalid shape", async () => {
    const invalidOutput = { fitScore: "not-a-number", headline: "" };

    const mockModel = new FakeListChatModel({ responses: [JSON.stringify(invalidOutput)] });

    const chain = buildAnalyzeFitRunnable(mockModel);

    const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    await expect(
      chain.invoke({ resume_text: "resume", job_text: "job" }),
    ).rejects.toThrow(expect.objectContaining({ name: "ZodError" }));

    expect(consoleErrorSpy).toHaveBeenCalledWith(
      "[validation-failed] AnalyzeFitRunnable",
      expect.anything(),
      invalidOutput,
    );
  });
});

// ---------------------------------------------------------------------------
// Validation failure — AtsAnalysisSchema (new fields)
// ---------------------------------------------------------------------------

describe("AtsAnalysisRunnable — validation failure on missing new fields", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("logs console.error and throws ZodError when atsScenarioSummary is missing", async () => {
    const invalidOutput = { atsScore: 80, machineRanking: [], atsAha: "Something" };

    const mockModel = new FakeListChatModel({ responses: [JSON.stringify(invalidOutput)] });

    const chain = buildAtsAnalysisRunnable(mockModel);

    const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    await expect(
      chain.invoke({ resume_text: "resume", job_text: "job" }),
    ).rejects.toThrow(expect.objectContaining({ name: "ZodError" }));

    expect(consoleErrorSpy).toHaveBeenCalledWith(
      "[validation-failed] AtsAnalysisRunnable",
      expect.anything(),
      invalidOutput,
    );
  });
});
