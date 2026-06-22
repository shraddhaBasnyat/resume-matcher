import { describe, it, expect, vi, afterEach } from "vitest";
import { ZodError } from "zod";
import { FakeListChatModel } from "@langchain/core/utils/testing";
import { makeAnalyzeNarrativeGapNode } from "../graphs/scoring/nodes/analyze-narrative-gap.js";
import type { GraphStateType } from "../graphs/scoring/scoring-graph-state.js";

afterEach(() => {
  vi.restoreAllMocks();
});

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const validLLMOutput = {
  reframingSuggestions: [
    { before: "Data Engineer", after: "ML Infrastructure Engineer", reason: "Aligns resume title with ML platform role requirements." },
    { before: "Kafka consumer for inventory events", after: "feature store consumer pattern", reason: "Names the pattern the role expects explicitly." },
  ],
  missingSkills: [],
  verdictAha: "Start with the reframing cards — once the framing is fixed, the score follows.",
};

const validFitAnalysis = {
  keyStrengths: ["Python at scale", "Kafka", "SQL", "distributed data systems"],
  experienceGaps: ["No direct ML model deployment experience listed"],
};

function buildBaseState(overrides: Partial<Record<string, unknown>> = {}): GraphStateType {
  return {
    resumeText: "Alex Smith resume text",
    jobText: "ML Platform Engineer at Acme AI",
    humanContext: "",
    fitScore: 62,
    headline: "Data Engineer with strong infrastructure background",
    battleCardBullets: [
      { requirement: "Python experience", evidence: "5 years of Python", verdict: "strong_match" as const },
      { requirement: "Streaming systems", evidence: "Kafka consumer ownership", verdict: "strong_match" as const },
    ],
    fitAha: "Your Kafka consumer work maps directly to a feature store consumer — the experience is there, the framing is not.",
    atsScore: null,
    atsAha: "Missing 'model serving' and 'ML infrastructure' — terms that would surface this resume in a recruiter search.",
    fitAnalysis: validFitAnalysis,
    weakMatch: false,
    weakMatchReason: null,
    jdArchetype: { ideal: "specialist_depth" as const, couldWork: [] },
    candidateArchetype: "specialist_depth" as const,
    careerArcNote: undefined,
    realAsk: "Build and operate a production ML platform — feature store, model serving, pipeline orchestration.",
    demonstratedVsClaimed: [],
    threadId: undefined,
    intent: undefined,
    intentContext: undefined,
    hitlFired: false,
    userTier: "base",
    scenarioId: "narrative_gap",
    fitAdvice: undefined,
    closingSummary: undefined,
    verdictAha: undefined,
    ...overrides,
  } as unknown as GraphStateType;
}

function buildMockModel() {
  return new FakeListChatModel({ responses: [JSON.stringify(validLLMOutput)] });
}

// ---------------------------------------------------------------------------
// Node behaviour tests
// ---------------------------------------------------------------------------

describe("analyzeNarrativeGap — output shape", () => {
  it("returns fitAdvice with scenarioId narrative_gap and all required fields, closingSummary and verdictAha at top level", async () => {
    const node = makeAnalyzeNarrativeGapNode(buildMockModel());
    const result = await node(buildBaseState());
    const advice = result.fitAdvice as Record<string, unknown>;

    expect(advice.scenarioId).toBe("narrative_gap");
    expect(Array.isArray(advice.reframingSuggestions)).toBe(true);
    expect(Array.isArray(advice.missingSkills)).toBe(true);
    // verdictAha must NOT be inside fitAdvice — it is a top-level state field
    expect(advice.closingSummary).toBeUndefined();
    expect(advice.verdictAha).toBeUndefined();
    expect((result as Record<string, unknown>).verdictAha).toBeDefined();
  });

  it("reframingSuggestions is non-empty", async () => {
    const node = makeAnalyzeNarrativeGapNode(buildMockModel());
    const result = await node(buildBaseState());
    const advice = result.fitAdvice as Record<string, unknown>;

    expect((advice.reframingSuggestions as object[]).length).toBeGreaterThan(0);
  });

  it("missingSkills as empty array passes through correctly", async () => {
    const node = makeAnalyzeNarrativeGapNode(buildMockModel());
    const result = await node(buildBaseState());
    const advice = result.fitAdvice as Record<string, unknown>;

    expect(advice.missingSkills).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// Guards
// ---------------------------------------------------------------------------

describe("analyzeNarrativeGap — guards", () => {
  it("throws when fitAnalysis is missing", async () => {
    const node = makeAnalyzeNarrativeGapNode(buildMockModel());
    await expect(
      node(buildBaseState({ fitAnalysis: undefined })),
    ).rejects.toThrow("fitAnalysis is missing");
  });

  it("throws when scenarioId is not narrative_gap", async () => {
    const node = makeAnalyzeNarrativeGapNode(buildMockModel());
    await expect(
      node(buildBaseState({ scenarioId: "confirmed_fit" })),
    ).rejects.toThrow('expected scenarioId "narrative_gap"');
  });

  it("throws when jdArchetype is missing", async () => {
    const node = makeAnalyzeNarrativeGapNode(buildMockModel());
    await expect(
      node(buildBaseState({ jdArchetype: undefined })),
    ).rejects.toThrow("jdArchetype is missing");
  });

  it("throws ZodError and calls logValidationFailure when LLM returns invalid shape", async () => {
    const invalidOutput = { reframingSuggestions: "not an array", missingSkills: 42 };

    const model = new FakeListChatModel({ responses: [JSON.stringify(invalidOutput)] });

    const node = makeAnalyzeNarrativeGapNode(model);

    const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    await expect(node(buildBaseState())).rejects.toBeInstanceOf(ZodError);

    expect(consoleErrorSpy).toHaveBeenCalledWith(
      "[validation-failed] NarrativeGapRunnable",
      expect.anything(),
      invalidOutput,
    );
  });
});
