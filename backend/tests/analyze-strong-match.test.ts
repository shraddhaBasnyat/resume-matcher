import { describe, it, expect, vi, afterEach } from "vitest";
import { FakeListChatModel } from "@langchain/core/utils/testing";
import { InvisibleExpertLLMSchema } from "../llm-wrappers/analyze-strong-match.wrapper.js";
import { makeAnalyzeStrongMatchNode } from "../graphs/scoring/nodes/analyze-strong-match.js";
import type { GraphStateType } from "../graphs/scoring/scoring-graph-state.js";

afterEach(() => {
  vi.restoreAllMocks();
});

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const validInvisibleExpertLLMOutput = {
  standoutStrengths: ["Deep ML background", "Python expertise at scale"],
  atsRealityCheck: [
    "Resume uses 'ML' but the job posting requires 'machine learning' verbatim.",
    "Missing keyword 'TensorFlow' despite being referenced in project descriptions.",
  ],
  terminologySwaps: [{ before: "ML", after: "machine learning", reason: "JD uses full term — ATS filters on exact match." }],
  keywordsToAdd: ["TensorFlow", "production ML systems"],
  leadWithThese: [],
  expectTheseQuestions: [],
  watchOutFor: [],
  verdictAha: "Your reframing cards show exactly how to retell the experience as the machine expects to read it.",
  terminologyDiffs: [],
};

const validConfirmedFitLLMOutput = {
  standoutStrengths: [],
  atsRealityCheck: [],
  terminologySwaps: [],
  keywordsToAdd: [],
  leadWithThese: [
    "Lead with the FastAPI service you took from greenfield to 50k RPM — names the scale directly.",
    "Your ML infrastructure work at the logistics company maps exactly to what this role owns.",
  ],
  expectTheseQuestions: [
    "Walk me through a time you owned a production service end-to-end.",
    "How did you approach the Python performance work at scale?",
    "What would you change about the ML infrastructure you built?",
  ],
  watchOutFor: [
    "Team leadership — the JD mentions mentoring. Be ready with a specific example.",
  ],
  verdictAha: "Your FastAPI and ML infra work maps directly — lead with the scale numbers.",
  terminologyDiffs: [],
};

const validFitAnalysis = {
  careerTrajectory: "Backend engineer progressing to ML-focused roles over 5 years",
  keyStrengths: ["Python", "FastAPI", "ML infrastructure"],
  experienceGaps: [],
};

function buildBaseState(overrides: Partial<Record<string, unknown>> = {}): GraphStateType {
  return {
    resumeText: "Jane Doe resume text",
    jobText: "Backend Engineer at Acme",
    humanContext: "",
    fitScore: 82,
    headline: "Backend Engineer with strong ML background",
    battleCardBullets: [
      { requirement: "Python backend experience", evidence: "5 years of Python", verdict: "strong_match" as const },
      { requirement: "API design", evidence: "FastAPI service design", verdict: "strong_match" as const },
    ],
    fitAha: "Five years of Python at scale maps directly to what this role requires.",
    atsScore: null,
    atsScenarioSummary: "Resume is parseable with clean formatting. No knockout risks identified.",
    atsAha: "Keyword coverage is solid — the machine picture is not a barrier here.",
    sourceRole: "backend_swe",
    targetRole: "backend_swe",
    fitAnalysis: validFitAnalysis,
    weakMatch: false,
    weakMatchReason: null,
    jdArchetype: { ideal: "specialist_depth" as const, couldWork: [] },
    candidateArchetype: "specialist_depth" as const,
    realAsk: "Build production backend systems with Python and FastAPI.",
    terminologyMismatches: [],
    careerArcNote: undefined,
    threadId: undefined,
    intent: undefined,
    intentContext: undefined,
    hitlFired: false,
    userTier: "base",
    scenarioId: undefined,
    fitAdvice: undefined,
    closingSummary: undefined,
    verdictAha: undefined,
    ...overrides,
  } as unknown as GraphStateType;
}

function buildMockModel() {
  return new FakeListChatModel({ responses: [JSON.stringify(validInvisibleExpertLLMOutput)] });
}

// ---------------------------------------------------------------------------
// Schema validation — InvisibleExpertLLMSchema
// ---------------------------------------------------------------------------

describe("InvisibleExpertLLMSchema", () => {
  it("accepts valid invisible_expert output", () => {
    expect(InvisibleExpertLLMSchema.safeParse(validInvisibleExpertLLMOutput).success).toBe(true);
  });

  it("rejects output missing atsRealityCheck", () => {
    const { atsRealityCheck: _, ...without } = validInvisibleExpertLLMOutput;
    expect(InvisibleExpertLLMSchema.safeParse(without).success).toBe(false);
  });

  it("rejects atsRealityCheck as a string — must be array", () => {
    expect(
      InvisibleExpertLLMSchema.safeParse({
        ...validInvisibleExpertLLMOutput,
        atsRealityCheck: "single string not array",
      }).success,
    ).toBe(false);
  });

  it("rejects non-array standoutStrengths", () => {
    expect(
      InvisibleExpertLLMSchema.safeParse({
        ...validInvisibleExpertLLMOutput,
        standoutStrengths: "strong Python skills",
      }).success,
    ).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Node unit tests — confirmed_fit path
// ---------------------------------------------------------------------------

describe("analyzeStrongMatch — confirmed_fit", () => {
  it("returns interview prep fields in fitAdvice, closingSummary and verdictAha at top level", async () => {
    const confirmedFitModel = new FakeListChatModel({
      responses: [JSON.stringify(validConfirmedFitLLMOutput)],
    });

    const node = makeAnalyzeStrongMatchNode(confirmedFitModel);
    const result = await node(buildBaseState({ scenarioId: "confirmed_fit" }));
    const advice = result.fitAdvice as Record<string, unknown>;

    expect(advice.scenarioId).toBe("confirmed_fit");

    // Interview prep fields must be present and non-empty
    expect(Array.isArray(advice.leadWithThese)).toBe(true);
    expect((advice.leadWithThese as unknown[]).length).toBeGreaterThan(0);
    expect(Array.isArray(advice.expectTheseQuestions)).toBe(true);
    expect((advice.expectTheseQuestions as unknown[]).length).toBeGreaterThan(0);
    expect(Array.isArray(advice.watchOutFor)).toBe(true);
    expect((advice.watchOutFor as unknown[]).length).toBeGreaterThan(0);

    // ATS fields must NOT appear in fitAdvice for confirmed_fit
    expect(advice.standoutStrengths).toBeUndefined();
    expect(advice.atsRealityCheck).toBeUndefined();
    expect(advice.terminologySwaps).toBeUndefined();
    expect(advice.keywordsToAdd).toBeUndefined();

    // verdictAha is a top-level state field, not inside fitAdvice
    expect(advice.closingSummary).toBeUndefined();
    expect(advice.verdictAha).toBeUndefined();
    expect((result as Record<string, unknown>).verdictAha).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// Node unit tests — invisible_expert path
// ---------------------------------------------------------------------------

describe("analyzeStrongMatch — invisible_expert", () => {
  it("returns LLM output fields in fitAdvice and verdictAha at top level", async () => {
    const model = buildMockModel();
    const node = makeAnalyzeStrongMatchNode(model);

    const result = await node(
      buildBaseState({
        scenarioId: "invisible_expert",
      }),
    );
    const advice = result.fitAdvice as Record<string, unknown>;

    expect(advice.scenarioId).toBe("invisible_expert");
    expect(Array.isArray(advice.standoutStrengths)).toBe(true);
    expect(Array.isArray(advice.atsRealityCheck)).toBe(true);
    expect(Array.isArray(advice.terminologySwaps)).toBe(true);
    expect(Array.isArray(advice.keywordsToAdd)).toBe(true);
    // verdictAha must NOT be inside fitAdvice
    expect(advice.closingSummary).toBeUndefined();
    expect(advice.verdictAha).toBeUndefined();
    // verdictAha must be a top-level state field
    expect((result as Record<string, unknown>).verdictAha).toBeDefined();
  });

  it("terminologySwaps and keywordsToAdd come from LLM output", async () => {
    const model = buildMockModel();
    const node = makeAnalyzeStrongMatchNode(model);

    const result = await node(
      buildBaseState({
        scenarioId: "invisible_expert",
      }),
    );
    const advice = result.fitAdvice as Record<string, unknown>;

    expect(advice.terminologySwaps).toEqual(validInvisibleExpertLLMOutput.terminologySwaps);
    expect(advice.keywordsToAdd).toEqual(validInvisibleExpertLLMOutput.keywordsToAdd);
  });
});

// ---------------------------------------------------------------------------
// Node unit tests — guards
// ---------------------------------------------------------------------------

describe("analyzeStrongMatch — guards", () => {
  it("throws when scenarioId is narrative_gap", async () => {
    const model = buildMockModel();
    const node = makeAnalyzeStrongMatchNode(model);

    await expect(
      node(buildBaseState({ scenarioId: "narrative_gap" as unknown as "confirmed_fit" })),
    ).rejects.toThrow('expected scenarioId "confirmed_fit" or "invisible_expert"');
  });

  it("throws when scenarioId is honest_verdict", async () => {
    const model = buildMockModel();
    const node = makeAnalyzeStrongMatchNode(model);

    await expect(
      node(buildBaseState({ scenarioId: "honest_verdict" as unknown as "confirmed_fit" })),
    ).rejects.toThrow('expected scenarioId "confirmed_fit" or "invisible_expert"');
  });

  it("throws when scenarioId is undefined", async () => {
    const model = buildMockModel();
    const node = makeAnalyzeStrongMatchNode(model);

    await expect(
      node(buildBaseState({ scenarioId: undefined })),
    ).rejects.toThrow('expected scenarioId "confirmed_fit" or "invisible_expert"');
  });

  it("throws when scenarioId is invisible_expert but fitAnalysis is missing", async () => {
    const model = buildMockModel();
    const node = makeAnalyzeStrongMatchNode(model);

    await expect(
      node(
        buildBaseState({
          scenarioId: "invisible_expert",
          fitAnalysis: undefined,
        }),
      ),
    ).rejects.toThrow("fitAnalysis is missing");
  });

  it("throws when jdArchetype is missing", async () => {
    const model = buildMockModel();
    const node = makeAnalyzeStrongMatchNode(model);

    await expect(
      node(buildBaseState({ scenarioId: "confirmed_fit", jdArchetype: undefined })),
    ).rejects.toThrow("jdArchetype is missing");
  });

});

// ---------------------------------------------------------------------------
// Validation failure
// ---------------------------------------------------------------------------

describe("analyzeStrongMatch — validation failure", () => {
  it("throws ZodError and calls logValidationFailure when LLM returns invalid shape", async () => {
    const invalidOutput = { standoutStrengths: "not-an-array", atsRealityCheck: 42 };

    const model = new FakeListChatModel({ responses: [JSON.stringify(invalidOutput)] });

    const node = makeAnalyzeStrongMatchNode(model);

    const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    await expect(
      node(buildBaseState({ scenarioId: "confirmed_fit" })),
    ).rejects.toThrow(expect.objectContaining({ name: "ZodError" }));

    expect(consoleErrorSpy.mock.calls[0][0]).toEqual(expect.stringContaining("InvisibleExpertRunnable"));
  });

  it("throws ZodError when leadWithThese is missing from output", async () => {
    const { leadWithThese: _, ...withoutLeadWithThese } = validConfirmedFitLLMOutput;
    expect(InvisibleExpertLLMSchema.safeParse(withoutLeadWithThese).success).toBe(false);
  });

  it("throws ZodError when expectTheseQuestions is missing from output", async () => {
    const { expectTheseQuestions: _, ...without } = validConfirmedFitLLMOutput;
    expect(InvisibleExpertLLMSchema.safeParse(without).success).toBe(false);
  });

  it("throws ZodError when watchOutFor is missing from output", async () => {
    const { watchOutFor: _, ...without } = validConfirmedFitLLMOutput;
    expect(InvisibleExpertLLMSchema.safeParse(without).success).toBe(false);
  });
});
