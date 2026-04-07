import { describe, it, expect, vi, beforeEach } from "vitest";
import { BaseChatModel } from "@langchain/core/language_models/chat_models";
import {
  ConfirmedFitLLMSchema,
  InvisibleExpertLLMSchema,
} from "../chains/analyze-strong-match-chain.js";
import { makeAnalyzeStrongMatchNode } from "../graphs/scoring/nodes/analyze-strong-match.js";
import type { GraphStateType } from "../graphs/scoring/scoring-graph-state.js";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const validConfirmedFitLLMOutput = {
  confirmation:
    "You are an excellent match for this role. Your five years of Python and production FastAPI services directly address the core requirements.",
  standoutStrengths: [
    "5 years of Python in production systems",
    "FastAPI service design and deployment",
    "PostgreSQL schema ownership",
  ],
  minorGaps: [],
};

const validInvisibleExpertLLMOutput = {
  confirmation:
    "You are a strong match for this role — your backend engineering background and ML work align closely with what they are looking for.",
  standoutStrengths: ["Deep ML background", "Python expertise at scale"],
  minorGaps: [],
  atsRealityCheck:
    "Your resume uses 'ML' throughout but the job posting requires 'machine learning' verbatim. " +
    "Automated systems do exact-match scans — 'ML' does not register. Swapping three instances resolves this.",
};

const validMatchResult = {
  fitScore: 82,
  matchedSkills: ["Python", "FastAPI", "PostgreSQL"],
  missingSkills: [],
  narrativeAlignment: "Strong backend engineering background aligns with this role.",
  gaps: [],
  resumeAdvice: [],
  contextPrompt: null,
  weakMatch: false,
};

const validResumeData = {
  name: "Jane Doe",
  email: "jane@example.com",
  phone: "555-1234",
  skills: ["Python", "FastAPI", "PostgreSQL"],
  experience: [{ company: "StartupCo", role: "Backend Engineer", years: 5 }],
  education: [{ degree: "B.Sc. CS", institution: "State U" }],
  careerNarrative: {
    trajectory: "Backend engineering",
    dominantTheme: "API and data systems",
    inferredStrengths: ["distributed systems", "data pipelines"],
    careerMotivation: "Building reliable backend infrastructure",
    resumeStoryGaps: [],
  },
  sourceRole: "backend_swe",
};

const validJobData = {
  title: "Backend Engineer",
  company: "Acme Corp",
  requiredSkills: ["Python", "FastAPI"],
  niceToHaveSkills: ["PostgreSQL"],
  keywords: ["machine learning", "TensorFlow"],
  experienceYears: 4,
  seniorityLevel: "senior" as const,
  targetRole: "backend_swe",
};

const validAtsProfile = {
  atsScore: 55,
  missingKeywords: ["machine learning", "TensorFlow"],
  layoutFlags: [] as [],
  terminologyGaps: ["resume uses 'ML'; job posting requires 'machine learning'"],
};

function buildBaseState(overrides: Partial<Record<string, unknown>> = {}): GraphStateType {
  return {
    resumeText: "Jane Doe resume text",
    jobText: "Backend Engineer at Acme",
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
    scenarioId: undefined,
    fitAdvice: undefined,
    atsAdvice: undefined,
    roadmapAdvice: undefined,
    ...overrides,
  } as unknown as GraphStateType;
}

function buildMockModel(
  confirmedFitReturn = validConfirmedFitLLMOutput,
  invisibleExpertReturn = validInvisibleExpertLLMOutput,
) {
  const mockBound = {
    withStructuredOutput: vi.fn().mockImplementation((schema: unknown) => {
      if (schema === ConfirmedFitLLMSchema) {
        return { invoke: vi.fn().mockResolvedValue(confirmedFitReturn) };
      }
      if (schema === InvisibleExpertLLMSchema) {
        return { invoke: vi.fn().mockResolvedValue(invisibleExpertReturn) };
      }
      return { invoke: vi.fn().mockResolvedValue({}) };
    }),
  };
  return {
    bind: vi.fn().mockReturnValue(mockBound),
  } as unknown as BaseChatModel;
}

// ---------------------------------------------------------------------------
// Schema validation — ConfirmedFitLLMSchema
// ---------------------------------------------------------------------------

describe("ConfirmedFitLLMSchema", () => {
  it("accepts valid confirmed fit output", () => {
    expect(ConfirmedFitLLMSchema.safeParse(validConfirmedFitLLMOutput).success).toBe(true);
  });

  it("accepts empty minorGaps — correct output when no material gaps exist", () => {
    expect(
      ConfirmedFitLLMSchema.safeParse({ ...validConfirmedFitLLMOutput, minorGaps: [] }).success,
    ).toBe(true);
  });

  it("rejects missing confirmation", () => {
    const { confirmation: _, ...without } = validConfirmedFitLLMOutput;
    expect(ConfirmedFitLLMSchema.safeParse(without).success).toBe(false);
  });

  it("rejects non-array standoutStrengths", () => {
    expect(
      ConfirmedFitLLMSchema.safeParse({
        ...validConfirmedFitLLMOutput,
        standoutStrengths: "strong Python skills",
      }).success,
    ).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Schema validation — InvisibleExpertLLMSchema
// ---------------------------------------------------------------------------

describe("InvisibleExpertLLMSchema", () => {
  it("accepts valid invisible expert LLM output", () => {
    expect(InvisibleExpertLLMSchema.safeParse(validInvisibleExpertLLMOutput).success).toBe(true);
  });

  it("rejects output missing atsRealityCheck — required for invisible_expert", () => {
    const { atsRealityCheck: _, ...without } = validInvisibleExpertLLMOutput;
    expect(InvisibleExpertLLMSchema.safeParse(without).success).toBe(false);
  });

  it("accepts empty minorGaps", () => {
    expect(
      InvisibleExpertLLMSchema.safeParse({ ...validInvisibleExpertLLMOutput, minorGaps: [] })
        .success,
    ).toBe(true);
  });

  it("rejects non-string atsRealityCheck", () => {
    expect(
      InvisibleExpertLLMSchema.safeParse({
        ...validInvisibleExpertLLMOutput,
        atsRealityCheck: ["array", "not", "string"],
      }).success,
    ).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Node unit tests — confirmed_fit path
// ---------------------------------------------------------------------------

describe("analyzeStrongMatch — confirmed_fit", () => {
  beforeEach(() => {
    vi.doMock("../langsmith.js", () => ({
      isTracingEnabled: () => false,
      getTraceUrl: vi.fn(),
      RootRunCapture: vi.fn().mockImplementation(() => ({ rootRunId: undefined })),
      logValidationFailure: vi.fn(),
      RUN_NAMES: {},
    }));
  });

  // Test case 1
  it("returns fitAdvice with scenarioId confirmed_fit and no ATS fields", async () => {
    const model = buildMockModel();
    const node = makeAnalyzeStrongMatchNode(model);

    const result = await node(buildBaseState({ scenarioId: "confirmed_fit" }));
    const advice = result.fitAdvice as Record<string, unknown>;

    expect(advice.scenarioId).toBe("confirmed_fit");
    expect(advice.confirmation).toBe(validConfirmedFitLLMOutput.confirmation);
    expect(advice.standoutStrengths).toEqual(validConfirmedFitLLMOutput.standoutStrengths);
    expect(advice.minorGaps).toEqual(validConfirmedFitLLMOutput.minorGaps);
    // ATS fields must not appear on confirmed_fit
    expect(advice.terminologySwaps).toBeUndefined();
    expect(advice.keywordsToAdd).toBeUndefined();
    expect(advice.layoutAdvice).toBeUndefined();
    expect(advice.atsRealityCheck).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// Node unit tests — invisible_expert path
// ---------------------------------------------------------------------------

describe("analyzeStrongMatch — invisible_expert", () => {
  beforeEach(() => {
    vi.doMock("../langsmith.js", () => ({
      isTracingEnabled: () => false,
      getTraceUrl: vi.fn(),
      RootRunCapture: vi.fn().mockImplementation(() => ({ rootRunId: undefined })),
      logValidationFailure: vi.fn(),
      RUN_NAMES: {},
    }));
  });

  // Test case 2
  it("merges LLM output with atsProfile pass-throughs — terminologySwaps from atsProfile, not LLM", async () => {
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
    // LLM-generated fields
    expect(advice.confirmation).toBe(validInvisibleExpertLLMOutput.confirmation);
    expect(advice.atsRealityCheck).toBe(validInvisibleExpertLLMOutput.atsRealityCheck);
    expect(advice.standoutStrengths).toEqual(validInvisibleExpertLLMOutput.standoutStrengths);
    // Pass-through fields — must come from atsProfile, not from the LLM schema
    expect(advice.terminologySwaps).toEqual(validAtsProfile.terminologyGaps);
    expect(advice.keywordsToAdd).toEqual(validAtsProfile.missingKeywords);
    expect(advice.layoutAdvice).toEqual(validAtsProfile.layoutFlags);
  });

  it("layoutAdvice is an empty array when atsProfile has no layoutFlags", async () => {
    const model = buildMockModel();
    const node = makeAnalyzeStrongMatchNode(model);

    const result = await node(
      buildBaseState({
        scenarioId: "invisible_expert",
        atsProfile: { ...validAtsProfile, layoutFlags: [] },
      }),
    );
    const advice = result.fitAdvice as Record<string, unknown>;

    expect(advice.layoutAdvice).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// Node unit tests — guards
// ---------------------------------------------------------------------------

describe("analyzeStrongMatch — guards", () => {
  beforeEach(() => {
    vi.doMock("../langsmith.js", () => ({
      isTracingEnabled: () => false,
      getTraceUrl: vi.fn(),
      RootRunCapture: vi.fn().mockImplementation(() => ({ rootRunId: undefined })),
      logValidationFailure: vi.fn(),
      RUN_NAMES: {},
    }));
  });

  // Test case 4
  it("throws when matchResult is missing", async () => {
    const model = buildMockModel();
    const node = makeAnalyzeStrongMatchNode(model);

    await expect(
      node(buildBaseState({ scenarioId: "confirmed_fit", matchResult: undefined })),
    ).rejects.toThrow("matchResult is missing");
  });

  it("throws when resumeData is missing", async () => {
    const model = buildMockModel();
    const node = makeAnalyzeStrongMatchNode(model);

    await expect(
      node(buildBaseState({ scenarioId: "confirmed_fit", resumeData: undefined })),
    ).rejects.toThrow("resumeData is missing");
  });

  it("throws when jobData is missing", async () => {
    const model = buildMockModel();
    const node = makeAnalyzeStrongMatchNode(model);

    await expect(
      node(buildBaseState({ scenarioId: "confirmed_fit", jobData: undefined })),
    ).rejects.toThrow("jobData is missing");
  });

  // Test case 3
  it("throws when scenarioId is narrative_gap — wrong node was called", async () => {
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

  // Test case 5
  it("throws when scenarioId is invisible_expert but atsProfile is missing", async () => {
    const model = buildMockModel();
    const node = makeAnalyzeStrongMatchNode(model);

    await expect(
      node(buildBaseState({ scenarioId: "invisible_expert", atsProfile: undefined })),
    ).rejects.toThrow("atsProfile is missing");
  });
});
