import { describe, it, expect, vi } from "vitest";
import { ZodError } from "zod";
import { BaseChatModel } from "@langchain/core/language_models/chat_models";
import { NarrativeGapLLMSchema } from "../chains/analyze-narrative-gap-chain.js";
import { makeAnalyzeNarrativeGapNode } from "../graphs/scoring/nodes/analyze-narrative-gap.js";
import type { GraphStateType } from "../graphs/scoring/scoring-graph-state.js";
import * as langsmith from "../langsmith.js";

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

const validLLMOutput = {
  reframingSuggestions: [
    "Retitle 'Data Engineer' to 'ML Infrastructure Engineer' and lead with the model serving work, not the ETL.",
    "The Kafka consumer you built for inventory events is the same pattern as a feature store consumer — name it that way.",
  ],
  transferableStrengths: ["Python at scale", "Distributed streaming (Kafka)", "SQL query optimisation"],
  missingSkills: [],
  closingSummary: "The experience is right — the framing is wrong. Your pipeline work maps directly once retold in ML infrastructure terms.",
  verdictAha: "Start with the reframing cards — once the framing is fixed, the score follows.",
};

const validFitAnalysis = {
  careerTrajectory: "Data engineering IC progressing over 5 years at a logistics company",
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
    battleCardBullets: ["5 years of Python", "Kafka consumer ownership"],
    fitScenarioSummary: "Strong pipeline background maps to ML platform work.",
    fitAha: "Your Kafka consumer work maps directly to a feature store consumer — the experience is there, the framing is not.",
    atsScore: null,
    atsScenarioSummary: "Resume is parseable. Missing two ML-specific terms the recruiter filters for.",
    atsAha: "Missing 'model serving' and 'ML infrastructure' — terms that would surface this resume in a recruiter search.",
    sourceRole: "data_engineer",
    targetRole: "ml_platform_swe",
    fitAnalysis: validFitAnalysis,
    weakMatch: false,
    weakMatchReason: null,
    threadId: undefined,
    intent: undefined,
    intentContext: undefined,
    hitlFired: false,
    userTier: "base",
    atsProfile: undefined,
    scenarioId: "narrative_gap",
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
      if (schema === NarrativeGapLLMSchema) {
        return { invoke: vi.fn().mockResolvedValue(validLLMOutput) };
      }
      return { invoke: vi.fn().mockResolvedValue({}) };
    }),
  } as unknown as BaseChatModel;
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
    expect(Array.isArray(advice.transferableStrengths)).toBe(true);
    expect(Array.isArray(advice.missingSkills)).toBe(true);
    // closingSummary and verdictAha must NOT be inside fitAdvice
    expect(advice.closingSummary).toBeUndefined();
    expect(advice.verdictAha).toBeUndefined();
    // They must be top-level state fields
    expect((result as Record<string, unknown>).closingSummary).toBeDefined();
    expect((result as Record<string, unknown>).verdictAha).toBeDefined();
  });

  it("reframingSuggestions is non-empty", async () => {
    const node = makeAnalyzeNarrativeGapNode(buildMockModel());
    const result = await node(buildBaseState());
    const advice = result.fitAdvice as Record<string, unknown>;

    expect((advice.reframingSuggestions as string[]).length).toBeGreaterThan(0);
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

  it("throws when fitScenarioSummary is missing", async () => {
    const node = makeAnalyzeNarrativeGapNode(buildMockModel());
    await expect(
      node(buildBaseState({ fitScenarioSummary: undefined })),
    ).rejects.toThrow("fitScenarioSummary is missing");
  });

  it("throws when atsScenarioSummary is missing", async () => {
    const node = makeAnalyzeNarrativeGapNode(buildMockModel());
    await expect(
      node(buildBaseState({ atsScenarioSummary: undefined })),
    ).rejects.toThrow("atsScenarioSummary is missing");
  });

  it("throws ZodError and calls logValidationFailure when LLM returns invalid shape", async () => {
    const invalidOutput = { reframingSuggestions: "not an array", transferableStrengths: 42 };

    const model = {
      bind: vi.fn().mockReturnThis(),
      withStructuredOutput: vi.fn().mockImplementation((schema: unknown) => {
        if (schema === NarrativeGapLLMSchema) {
          return { invoke: vi.fn().mockResolvedValue(invalidOutput) };
        }
        return { invoke: vi.fn().mockResolvedValue({}) };
      }),
    } as unknown as BaseChatModel;

    const node = makeAnalyzeNarrativeGapNode(model);

    await expect(node(buildBaseState())).rejects.toBeInstanceOf(ZodError);

    expect(langsmith.logValidationFailure).toHaveBeenCalledWith(
      expect.objectContaining({
        nodeName: "analyze-narrative-gap",
        rawOutput: invalidOutput,
      }),
    );
  });
});
