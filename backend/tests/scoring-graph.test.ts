import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { BaseChatModel } from "@langchain/core/language_models/chat_models";
import { FakeListChatModel } from "@langchain/core/utils/testing";
import { RunnableLambda } from "@langchain/core/runnables";
import { AnalyzeFitLLMSchema, buildAnalyzeFitRunnable } from "../llm-wrappers/analyze-fit.wrapper.js";
import { AnalyzeJDLLMSchema, buildAnalyzeJDRunnable } from "../llm-wrappers/analyze-jd.wrapper.js";
import { AnalyzeResumeLLMSchema, buildAnalyzeResumeRunnable } from "../llm-wrappers/analyze-resume.wrapper.js";
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

const validAnalyzeJDOutput = {
  jdArchetype: {
    ideal: "specialist_depth" as const,
    couldWork: ["scale_operator" as const],
  },
  realAsk: "Build production-scale frontend systems with TypeScript and React component architecture.",
  // Filter terms present in the standard confirmed_fit resumeText → atsScore = 100
  recruiterFilter: "TypeScript, React",
};

const validAnalyzeResumeOutput = {
  candidateArchetype: "specialist_depth" as const,
  demonstratedVsClaimed: [
    {
      // Bullet contains "TypeScript" and "React" → present_demonstrated for those filter terms
      bullet: "5 years of TypeScript and React across production SPAs",
      status: "demonstrated" as const,
      evidencePresent: "shipped 3 production SPAs with 50k+ MAU",
    },
    {
      bullet: "Experience with agentic LLM systems",
      status: "claimed" as const,
      evidencePresent: null,
    },
  ],
  scopeAmbiguity: [],
  careerArcNote: {
    transitions: [
      {
        from: "growth_hire" as const,
        to: "specialist_depth" as const,
        signal: "Early career generalist work gave way to frontend platform engineering at scale",
      },
    ],
  },
  resumeAha: "Strong TypeScript and React depth demonstrated in production — all signals point to specialist_depth.",
};

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
  const fitLow = overrides.fitScore === "low";

  const analyzeFitOutput = fitLow ? weakAnalyzeFitLLMOutput : validAnalyzeFitLLMOutput;

  // atsScore override controls what atsGapAnalysis computes — it's deterministic now,
  // so we control it via the recruiterFilter in the analyzeJD mock output.
  // Low atsScore: use a filter with terms that won't appear in the test resume text.
  const analyzeJDOutput = overrides.atsScore === "low"
    ? { ...validAnalyzeJDOutput, recruiterFilter: "LangGraph, agentic, AI inference, vector-db, RLHF" }
    : validAnalyzeJDOutput;

  return new SchemaAwareFakeChatModel(new Map<unknown, unknown>([
    [AnalyzeJDLLMSchema, analyzeJDOutput],
    [AnalyzeResumeLLMSchema, validAnalyzeResumeOutput],
    [AnalyzeFitLLMSchema, analyzeFitOutput],
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
        resumeText: "Jane Doe TypeScript and React engineer resume text",
        jobText: "Senior Frontend Engineer at Acme",
        intent: "confident_match",
        intentContext: { basis: ["direct_experience"] },
        userTier: "base",
      },
      { configurable: { thread_id: threadId } },
    );

    // analyzeJD outputs in state
    expect(state.jdArchetype).toBeDefined();
    expect(state.realAsk).toBeDefined();
    expect(state.recruiterFilter).toBeDefined();

    // analyzeResume outputs in state
    expect(state.candidateArchetype).toBeDefined();
    expect(Array.isArray(state.demonstratedVsClaimed)).toBe(true);

    // atsGapAnalysis outputs (deterministic)
    expect(state.atsScore).toBeDefined();
    expect(Array.isArray(state.termGaps)).toBe(true);

    // analyzeFit outputs in state
    expect(state.fitScore).toBeDefined();
    expect(typeof state.fitScore).toBe("number");
    expect(state.headline).toBeDefined();
    expect(Array.isArray(state.battleCardBullets)).toBe(true);
    expect(state.fitScenarioSummary).toBeDefined();
    expect(state.fitAha).toBeDefined();
    expect(state.closingSummary).toBeDefined();
    expect(state.verdictAha).toBeDefined();
    expect(state.fitAnalysis).toBeDefined();

    // Old state fields no longer exist
    expect((state as Record<string, unknown>).resumeData).toBeUndefined();
    expect((state as Record<string, unknown>).jobData).toBeUndefined();
    expect((state as Record<string, unknown>).matchResult).toBeUndefined();
    expect((state as Record<string, unknown>).atsProfile).toBeUndefined();

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
        resumeText: "Jane Doe TypeScript and React engineer resume text",
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
    expect(Array.isArray(advice.atsRealityCheck)).toBe(true);
    expect(Array.isArray(advice.terminologySwaps)).toBe(true);
    expect(Array.isArray(advice.keywordsToAdd)).toBe(true);
  });

  it("honest_verdict — fitScore < 50 with contextPrompt triggers interrupt", async () => {
    const lowScoreInterruptModel = new SchemaAwareFakeChatModel(new Map<unknown, unknown>([
      [AnalyzeJDLLMSchema, validAnalyzeJDOutput],
      [AnalyzeResumeLLMSchema, validAnalyzeResumeOutput],
      [AnalyzeFitLLMSchema, weakAnalyzeFitLLMOutput],
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
      [AnalyzeJDLLMSchema, validAnalyzeJDOutput],
      [AnalyzeResumeLLMSchema, validAnalyzeResumeOutput],
      [AnalyzeFitLLMSchema, weakAnalyzeFitLLMOutput],
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
      chain.invoke({
        resume_text: "resume",
        job_text: "job",
        candidate_archetype: "specialist_depth",
        jd_archetype_ideal: "specialist_depth",
        jd_archetype_could_work: [],
        real_ask: "Build AI agents",
        demonstrated_vs_claimed: '- "Built agents" [claimed] no evidence',
      }),
    ).rejects.toThrow(expect.objectContaining({ name: "ZodError" }));

    expect(consoleErrorSpy).toHaveBeenCalledWith(
      "[validation-failed] AnalyzeFitRunnable",
      expect.anything(),
      invalidOutput,
    );
  });
});

// ---------------------------------------------------------------------------
// Validation failure — AnalyzeJDLLMSchema
// ---------------------------------------------------------------------------

describe("AnalyzeJDRunnable — validation failure", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("logs console.error and throws ZodError when model returns invalid shape", async () => {
    const invalidOutput = { jdArchetype: { ideal: "not-an-archetype" } };

    const mockModel = new FakeListChatModel({ responses: [JSON.stringify(invalidOutput)] });

    const chain = buildAnalyzeJDRunnable(mockModel);

    const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    await expect(
      chain.invoke({ job_text: "job description" }),
    ).rejects.toThrow(expect.objectContaining({ name: "ZodError" }));

    expect(consoleErrorSpy).toHaveBeenCalledWith(
      "[validation-failed] AnalyzeJDRunnable",
      expect.anything(),
      invalidOutput,
    );
  });
});

// ---------------------------------------------------------------------------
// Validation failure — AnalyzeResumeLLMSchema
// ---------------------------------------------------------------------------

describe("AnalyzeResumeRunnable — validation failure", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("logs console.error and throws ZodError when model returns invalid shape", async () => {
    const invalidOutput = { candidateArchetype: "not-an-archetype", demonstratedVsClaimed: "should-be-array" };

    const mockModel = new FakeListChatModel({ responses: [JSON.stringify(invalidOutput)] });

    const chain = buildAnalyzeResumeRunnable(mockModel);

    const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    await expect(
      chain.invoke({ resume_text: "resume text" }),
    ).rejects.toThrow(expect.objectContaining({ name: "ZodError" }));

    expect(consoleErrorSpy).toHaveBeenCalledWith(
      "[validation-failed] AnalyzeResumeRunnable",
      expect.anything(),
      invalidOutput,
    );
  });
});
