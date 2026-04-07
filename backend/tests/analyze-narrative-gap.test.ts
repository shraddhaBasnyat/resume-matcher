import { describe, it, expect, vi } from "vitest";
import { BaseChatModel } from "@langchain/core/language_models/chat_models";
import { NarrativeGapLLMSchema } from "../chains/analyze-narrative-gap-chain.js";
import { makeAnalyzeNarrativeGapNode } from "../graphs/scoring/nodes/analyze-narrative-gap.js";
import type { GraphStateType } from "../graphs/scoring/scoring-graph-state.js";

vi.mock("../langsmith.js", () => ({
  isTracingEnabled: () => false,
  getTraceUrl: vi.fn(),
  RootRunCapture: vi.fn().mockImplementation(function () { return { rootRunId: undefined }; }),
  logValidationFailure: vi.fn(),
  RUN_NAMES: {},
}));

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const validLLMOutput = {
  narrativeBridge:
    "Your five years building data pipelines at a logistics company maps directly to the ML platform engineering role — the infrastructure problems are identical, only the payloads differ.",
  reframingSuggestions: [
    "Retitle 'Data Engineer' to 'ML Infrastructure Engineer' and lead with the model serving work, not the ETL.",
    "The Kafka consumer you built for inventory events is the same pattern as a feature store consumer — name it that way.",
  ],
  transferableStrengths: ["Python at scale", "Distributed streaming (Kafka)", "SQL query optimisation"],
  missingSkills: [],
};

const validMatchResult = {
  fitScore: 62,
  matchedSkills: ["Python", "Kafka", "SQL"],
  missingSkills: [],
  narrativeAlignment:
    "Candidate has built data pipelines at scale. The infrastructure work closely mirrors ML platform engineering.",
  gaps: ["No direct ML model deployment experience listed"],
  resumeAdvice: ["Add a section on model serving", "Highlight the Kafka consumer work"],
  contextPrompt: null,
  weakMatch: false,
};

const validResumeData = {
  name: "Alex Smith",
  email: "alex@example.com",
  phone: "555-0100",
  skills: ["Python", "Kafka", "SQL", "Spark"],
  experience: [{ company: "Logisticsco", role: "Data Engineer", years: 5 }],
  education: [{ degree: "B.Sc. CS", institution: "State U" }],
  careerNarrative: {
    trajectory: "Data engineering",
    dominantTheme: "Large-scale data pipelines",
    inferredStrengths: ["distributed systems", "data reliability"],
    careerMotivation: "Building infrastructure that ML teams can depend on",
    resumeStoryGaps: ["ML framing absent despite relevant infrastructure work"],
  },
  sourceRole: "data_engineer",
};

const validJobData = {
  title: "ML Platform Engineer",
  company: "Acme AI",
  requiredSkills: ["Python", "Kafka", "model serving"],
  niceToHaveSkills: ["Spark"],
  keywords: ["feature store", "MLOps", "model deployment"],
  experienceYears: 4,
  seniorityLevel: "mid" as const,
  targetRole: "ml_platform_swe",
};

function buildBaseState(overrides: Partial<Record<string, unknown>> = {}): GraphStateType {
  return {
    resumeText: "Alex Smith resume text",
    jobText: "ML Platform Engineer at Acme AI",
    humanContext: "",
    resumeData: validResumeData,
    jobData: validJobData,
    matchResult: validMatchResult,
    threadId: undefined,
    intent: undefined,
    intentContext: undefined,
    archetypeContext: null,
    hitlFired: false,
    userTier: "base",
    atsProfile: undefined,
    scenarioId: "narrative_gap",
    fitAdvice: undefined,
    atsAdvice: undefined,
    roadmapAdvice: undefined,
    ...overrides,
  } as unknown as GraphStateType;
}

function buildMockModel() {
  const mockBound = {
    withStructuredOutput: vi.fn().mockImplementation((schema: unknown) => {
      if (schema === NarrativeGapLLMSchema) {
        return { invoke: vi.fn().mockResolvedValue(validLLMOutput) };
      }
      return { invoke: vi.fn().mockResolvedValue({}) };
    }),
  };
  return {
    bind: vi.fn().mockReturnValue(mockBound),
  } as unknown as BaseChatModel;
}

// ---------------------------------------------------------------------------
// Node behaviour tests
// ---------------------------------------------------------------------------

describe("analyzeNarrativeGap — output shape", () => {
  // Test case 1
  it("returns fitAdvice with scenarioId narrative_gap and all required fields", async () => {
    const node = makeAnalyzeNarrativeGapNode(buildMockModel());
    const result = await node(buildBaseState());
    const advice = result.fitAdvice as Record<string, unknown>;

    expect(advice.scenarioId).toBe("narrative_gap");
    expect(typeof advice.narrativeBridge).toBe("string");
    expect(Array.isArray(advice.reframingSuggestions)).toBe(true);
    expect(Array.isArray(advice.transferableStrengths)).toBe(true);
    expect(Array.isArray(advice.missingSkills)).toBe(true);
  });

  // Test case 2
  it("reframingSuggestions is non-empty", async () => {
    const node = makeAnalyzeNarrativeGapNode(buildMockModel());
    const result = await node(buildBaseState());
    const advice = result.fitAdvice as Record<string, unknown>;

    expect((advice.reframingSuggestions as string[]).length).toBeGreaterThan(0);
  });

  // Test case 3
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
  // Test case 4
  it("throws when matchResult is missing", async () => {
    const node = makeAnalyzeNarrativeGapNode(buildMockModel());
    await expect(
      node(buildBaseState({ matchResult: undefined })),
    ).rejects.toThrow("matchResult is missing");
  });

  // Test case 5
  it("throws when resumeData is missing", async () => {
    const node = makeAnalyzeNarrativeGapNode(buildMockModel());
    await expect(
      node(buildBaseState({ resumeData: undefined })),
    ).rejects.toThrow("resumeData is missing");
  });

  // Test case 6
  it("throws when jobData is missing", async () => {
    const node = makeAnalyzeNarrativeGapNode(buildMockModel());
    await expect(
      node(buildBaseState({ jobData: undefined })),
    ).rejects.toThrow("jobData is missing");
  });

  // Test case 7
  it("throws when scenarioId is not narrative_gap", async () => {
    const node = makeAnalyzeNarrativeGapNode(buildMockModel());
    await expect(
      node(buildBaseState({ scenarioId: "confirmed_fit" })),
    ).rejects.toThrow('expected scenarioId "narrative_gap"');
  });
});
