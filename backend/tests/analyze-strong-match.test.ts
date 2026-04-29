import { describe, it, expect, vi } from "vitest";
import { BaseChatModel } from "@langchain/core/language_models/chat_models";
import { InvisibleExpertLLMSchema } from "../chains/analyze-strong-match-chain.js";
import { makeAnalyzeStrongMatchNode } from "../graphs/scoring/nodes/analyze-strong-match.js";
import type { GraphStateType } from "../graphs/scoring/scoring-graph-state.js";

vi.mock("../langsmith.js", () => ({
  isTracingEnabled: () => false,
  getTraceUrl: vi.fn(),
  RootRunCapture: function RootRunCapture(
    this: Record<string, unknown>,
    _callback: (id: string) => void,
  ) {},
  logValidationFailure: vi.fn(),
  RUN_NAMES: {},
}));

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const validInvisibleExpertLLMOutput = {
  standoutStrengths: ["Deep ML background", "Python expertise at scale"],
  atsRealityCheck: [
    "Resume uses 'ML' but the job posting requires 'machine learning' verbatim.",
    "Missing keyword 'TensorFlow' despite being referenced in project descriptions.",
  ],
  terminologySwaps: ['Replace "ML" with "machine learning"'],
  keywordsToAdd: ["TensorFlow", "production ML systems"],
  closingSummary: "Your background is exactly what this role needs — the gap is in how your resume reads to machines, not to humans.",
  verdictAha: "Your reframing cards show exactly how to retell the experience as the machine expects to read it.",
};

const validFitAnalysis = {
  careerTrajectory: "Backend engineer progressing to ML-focused roles over 5 years",
  keyStrengths: ["Python", "FastAPI", "ML infrastructure"],
  experienceGaps: [],
};

const validAtsProfile = {
  atsScore: 55,
  machineParsing: ["// TODO: replace with programmatic resume parsing analysis"],
  machineRanking: [
    "resume uses 'ML'; job posting requires 'machine learning'",
    "missing keyword: 'TensorFlow'",
  ],
};

function buildBaseState(overrides: Partial<Record<string, unknown>> = {}): GraphStateType {
  return {
    resumeText: "Jane Doe resume text",
    jobText: "Backend Engineer at Acme",
    humanContext: "",
    fitScore: 82,
    headline: "Backend Engineer with strong ML background",
    battleCardBullets: ["5 years of Python", "FastAPI service design"],
    fitScenarioSummary: "Strong backend background maps to this role.",
    fitAha: "Five years of Python at scale maps directly to what this role requires.",
    atsScore: null,
    atsScenarioSummary: "Resume is parseable with clean formatting. No knockout risks identified.",
    atsAha: "Keyword coverage is solid — the machine picture is not a barrier here.",
    sourceRole: "backend_swe",
    targetRole: "backend_swe",
    fitAnalysis: validFitAnalysis,
    weakMatch: false,
    weakMatchReason: null,
    threadId: undefined,
    intent: undefined,
    intentContext: undefined,
    hitlFired: false,
    userTier: "base",
    atsProfile: undefined,
    scenarioId: undefined,
    fitAdvice: undefined,
    closingSummary: undefined,
    verdictAha: undefined,
    ...overrides,
  } as unknown as GraphStateType;
}

function buildMockModel() {
  return {
    bind: vi.fn().mockReturnThis(),
    withStructuredOutput: vi.fn().mockImplementation((schema: unknown) => {
      if (schema === InvisibleExpertLLMSchema) {
        return { invoke: vi.fn().mockResolvedValue(validInvisibleExpertLLMOutput) };
      }
      return { invoke: vi.fn().mockResolvedValue({}) };
    }),
  } as unknown as BaseChatModel;
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
  it("calls LLM and returns empty fitAdvice, with closingSummary and verdictAha in state", async () => {
    const model = buildMockModel();
    const node = makeAnalyzeStrongMatchNode(model);

    const result = await node(buildBaseState({ scenarioId: "confirmed_fit" }));
    const advice = result.fitAdvice as Record<string, unknown>;

    expect(advice.scenarioId).toBe("confirmed_fit");
    expect(Array.isArray(advice.fitAdvice)).toBe(true);
    expect((advice.fitAdvice as unknown[]).length).toBe(0);

    // ATS fields must NOT appear in fitAdvice for confirmed_fit
    expect(advice.standoutStrengths).toBeUndefined();
    expect(advice.atsRealityCheck).toBeUndefined();
    expect(advice.terminologySwaps).toBeUndefined();
    expect(advice.keywordsToAdd).toBeUndefined();

    // closingSummary and verdictAha are top-level state fields
    expect((result as Record<string, unknown>).closingSummary).toBeDefined();
    expect((result as Record<string, unknown>).verdictAha).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// Node unit tests — invisible_expert path
// ---------------------------------------------------------------------------

describe("analyzeStrongMatch — invisible_expert", () => {
  it("returns LLM output fields in fitAdvice, closingSummary and verdictAha at top level", async () => {
    const model = buildMockModel();
    const node = makeAnalyzeStrongMatchNode(model);

    const result = await node(
      buildBaseState({
        scenarioId: "invisible_expert",
        atsProfile: validAtsProfile,
      }),
    );
    const advice = result.fitAdvice as Record<string, unknown>;

    expect(advice.scenarioId).toBe("invisible_expert");
    expect(Array.isArray(advice.standoutStrengths)).toBe(true);
    expect(Array.isArray(advice.atsRealityCheck)).toBe(true);
    expect(Array.isArray(advice.terminologySwaps)).toBe(true);
    expect(Array.isArray(advice.keywordsToAdd)).toBe(true);
    // closingSummary and verdictAha must NOT be inside fitAdvice
    expect(advice.closingSummary).toBeUndefined();
    expect(advice.verdictAha).toBeUndefined();
    // They must be top-level state fields
    expect((result as Record<string, unknown>).closingSummary).toBeDefined();
    expect((result as Record<string, unknown>).verdictAha).toBeDefined();
  });

  it("terminologySwaps and keywordsToAdd come from LLM output", async () => {
    const model = buildMockModel();
    const node = makeAnalyzeStrongMatchNode(model);

    const result = await node(
      buildBaseState({
        scenarioId: "invisible_expert",
        atsProfile: validAtsProfile,
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

  it("throws when scenarioId is invisible_expert but atsProfile is missing", async () => {
    const model = buildMockModel();
    const node = makeAnalyzeStrongMatchNode(model);

    await expect(
      node(buildBaseState({ scenarioId: "invisible_expert", atsProfile: undefined })),
    ).rejects.toThrow("atsProfile is missing");
  });

  it("throws when scenarioId is invisible_expert but fitAnalysis is missing", async () => {
    const model = buildMockModel();
    const node = makeAnalyzeStrongMatchNode(model);

    await expect(
      node(
        buildBaseState({
          scenarioId: "invisible_expert",
          atsProfile: validAtsProfile,
          fitAnalysis: undefined,
        }),
      ),
    ).rejects.toThrow("fitAnalysis is missing");
  });

  it("throws when fitScenarioSummary is missing", async () => {
    const model = buildMockModel();
    const node = makeAnalyzeStrongMatchNode(model);

    await expect(
      node(buildBaseState({ scenarioId: "confirmed_fit", fitScenarioSummary: undefined })),
    ).rejects.toThrow("fitScenarioSummary is missing");
  });

  it("throws when atsScenarioSummary is missing", async () => {
    const model = buildMockModel();
    const node = makeAnalyzeStrongMatchNode(model);

    await expect(
      node(buildBaseState({ scenarioId: "confirmed_fit", atsScenarioSummary: undefined })),
    ).rejects.toThrow("atsScenarioSummary is missing");
  });
});

// ---------------------------------------------------------------------------
// Validation failure
// ---------------------------------------------------------------------------

describe("analyzeStrongMatch — validation failure", () => {
  it("throws ZodError and calls logValidationFailure when LLM returns invalid shape", async () => {
    const invalidOutput = { standoutStrengths: "not-an-array", atsRealityCheck: 42 };
    const langsmithModule = await import("../langsmith.js");

    const model = {
      bind: vi.fn().mockReturnThis(),
      withStructuredOutput: vi.fn().mockImplementation((schema: unknown) => {
        if (schema === InvisibleExpertLLMSchema) {
          return { invoke: vi.fn().mockResolvedValue(invalidOutput) };
        }
        return { invoke: vi.fn().mockResolvedValue({}) };
      }),
    } as unknown as BaseChatModel;

    const node = makeAnalyzeStrongMatchNode(model);

    await expect(
      node(buildBaseState({ scenarioId: "confirmed_fit" })),
    ).rejects.toThrow(expect.objectContaining({ name: "ZodError" }));

    expect(langsmithModule.logValidationFailure).toHaveBeenCalledWith(
      expect.objectContaining({
        nodeName: expect.stringContaining("analyze-strong-match"),
        rawOutput: invalidOutput,
      }),
    );
  });
});
