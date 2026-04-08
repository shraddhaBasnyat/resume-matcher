import { describe, it, expect, vi } from "vitest";
import { ZodError } from "zod";
import { BaseChatModel } from "@langchain/core/language_models/chat_models";
import { HonestVerdictLLMSchema } from "../chains/analyze-skeptical-reconciliation-chain.js";
import { makeAnalyzeSkepticalReconciliationNode } from "../graphs/scoring/nodes/analyze-skeptical-reconciliation.js";
import type { GraphStateType } from "../graphs/scoring/scoring-graph-state.js";
import * as langsmith from "../langsmith.js";
import * as langgraph from "@langchain/langgraph";

vi.mock("../langsmith.js", () => ({
  isTracingEnabled: () => false,
  getTraceUrl: vi.fn(),
  RootRunCapture: vi.fn().mockImplementation(function () { return { rootRunId: undefined }; }),
  logValidationFailure: vi.fn(),
  RUN_NAMES: {},
}));

vi.mock("@langchain/langgraph", () => ({
  interrupt: vi.fn().mockReturnValue("user-provided context"),
  Command: vi.fn().mockImplementation(function (this: Record<string, unknown>, args: unknown) {
    Object.assign(this, args as object);
  }),
}));

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const validLLMOutput = {
  honestAssessment:
    "The gap is real — you have three years of frontend work but this role requires five or more years of backend systems experience, including distributed architecture ownership that does not appear anywhere in your history.",
  closingSteps: [
    "Build and ship a production backend service end-to-end — API design, data layer, deployment.",
    "Take on infrastructure ownership in your current role: own a service from incident to postmortem.",
  ],
  acknowledgement: null,
};

const validLLMOutputWithAck = {
  ...validLLMOutput,
  acknowledgement:
    "Your freelance backend projects show initiative, but the scope and scale fall short of what this role requires at a senior level.",
};

const validMatchResult = {
  fitScore: 38,
  matchedSkills: ["JavaScript", "React"],
  missingSkills: ["distributed systems", "backend architecture", "Kubernetes"],
  narrativeAlignment:
    "Candidate has strong frontend experience but has not owned backend systems at the scale this role requires.",
  gaps: [
    "No backend architecture ownership",
    "No distributed systems experience",
    "Experience level is junior relative to role requirements",
  ],
  resumeAdvice: ["Add backend projects", "Highlight any API work"],
  contextPrompt: null,
  weakMatch: true,
  weakMatchReason:
    "Three of five required skills are absent and the candidate's experience level is too junior for a senior backend role.",
};

const validResumeData = {
  name: "Jordan Lee",
  email: "jordan@example.com",
  phone: "555-0199",
  skills: ["JavaScript", "React", "CSS"],
  experience: [{ company: "WebAgency", role: "Frontend Developer", years: 3 }],
  education: [{ degree: "B.Sc. CS", institution: "State U" }],
  careerNarrative: {
    trajectory: "Frontend development",
    dominantTheme: "UI engineering",
    inferredStrengths: ["component design", "CSS layout"],
    careerMotivation: "Building polished user interfaces",
    resumeStoryGaps: ["No backend systems experience"],
  },
  sourceRole: "frontend_swe",
};

const validJobData = {
  title: "Senior Backend Engineer",
  company: "Infra Corp",
  requiredSkills: ["distributed systems", "backend architecture", "Kubernetes", "Go", "PostgreSQL"],
  niceToHaveSkills: ["Rust"],
  keywords: ["microservices", "SRE", "incident response"],
  experienceYears: 5,
  seniorityLevel: "senior" as const,
  targetRole: "backend_swe",
};

function buildBaseState(overrides: Partial<Record<string, unknown>> = {}): GraphStateType {
  return {
    resumeText: "Jordan Lee resume text",
    jobText: "Senior Backend Engineer at Infra Corp",
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
    scenarioId: "honest_verdict",
    fitAdvice: undefined,
    atsAdvice: undefined,
    roadmapAdvice: undefined,
    ...overrides,
  } as unknown as GraphStateType;
}

function buildMockModel(llmReturn: Record<string, unknown> = validLLMOutput) {
  return {
    bind: vi.fn().mockReturnThis(),
    withStructuredOutput: vi.fn().mockImplementation((schema: unknown) => {
      if (schema === HonestVerdictLLMSchema) {
        return { invoke: vi.fn().mockResolvedValue(llmReturn) };
      }
      return { invoke: vi.fn().mockResolvedValue({}) };
    }),
  } as unknown as BaseChatModel;
}

// ---------------------------------------------------------------------------
// Test case 1 — contextPrompt null: LLM runs, fitAdvice written, acknowledgement null
// ---------------------------------------------------------------------------

describe("analyzeSkepticalReconciliation — contextPrompt null path", () => {
  it("LLM runs and fitAdvice is written with scenarioId honest_verdict and acknowledgement null", async () => {
    const node = makeAnalyzeSkepticalReconciliationNode(buildMockModel());
    const result = await node(buildBaseState());
    const advice = result.fitAdvice as Record<string, unknown>;

    expect(advice.scenarioId).toBe("honest_verdict");
    expect(typeof advice.honestAssessment).toBe("string");
    expect(Array.isArray(advice.closingSteps)).toBe(true);
    expect(advice.acknowledgement).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Test case 2 — hitlFired true: LLM runs with humanContext, acknowledgement non-null
// ---------------------------------------------------------------------------

describe("analyzeSkepticalReconciliation — hitlFired path", () => {
  it("LLM runs when hitlFired is true and acknowledgement is a non-null string", async () => {
    const node = makeAnalyzeSkepticalReconciliationNode(buildMockModel(validLLMOutputWithAck));
    const result = await node(
      buildBaseState({
        hitlFired: true,
        humanContext: "I have done freelance backend work for two years outside my main role.",
      }),
    );
    const advice = result.fitAdvice as Record<string, unknown>;

    expect(advice.scenarioId).toBe("honest_verdict");
    expect(typeof advice.acknowledgement).toBe("string");
    expect((advice.acknowledgement as string).length).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// Test case 9 — contextPrompt non-null: interrupt fires, Command returned, LLM not called
// ---------------------------------------------------------------------------

describe("analyzeSkepticalReconciliation — interrupt path", () => {
  it("interrupt fires with contextPrompt, Command has goto scoreMatch, fitAdvice not written", async () => {
    const chainInvoke = vi.fn();
    const model = {
      bind: vi.fn().mockReturnThis(),
      withStructuredOutput: vi.fn().mockImplementation((schema: unknown) => {
        if (schema === HonestVerdictLLMSchema) {
          return { invoke: chainInvoke };
        }
        return { invoke: vi.fn().mockResolvedValue({}) };
      }),
    } as unknown as BaseChatModel;

    const contextPrompt = "Can you describe any production backend systems you have shipped?";
    const node = makeAnalyzeSkepticalReconciliationNode(model);
    const result = await node(
      buildBaseState({ matchResult: { ...validMatchResult, contextPrompt } }),
    );

    expect(langgraph.interrupt).toHaveBeenCalledWith(contextPrompt);
    expect(result).toMatchObject({
      update: { humanContext: "user-provided context", hitlFired: true },
      goto: "scoreMatch",
    });
    expect((result as Record<string, unknown>).fitAdvice).toBeUndefined();
    expect(chainInvoke).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// Test cases 3 & 4 — validation failure
// ---------------------------------------------------------------------------

describe("analyzeSkepticalReconciliation — validation failure", () => {
  // Test case 3
  it("rejects with ZodError and calls logValidationFailure when LLM returns invalid shape", async () => {
    const invalidOutput = { honestAssessment: 42, closingSteps: "not an array" };

    const model = {
      bind: vi.fn().mockReturnThis(),
      withStructuredOutput: vi.fn().mockImplementation((schema: unknown) => {
        if (schema === HonestVerdictLLMSchema) {
          return { invoke: vi.fn().mockResolvedValue(invalidOutput) };
        }
        return { invoke: vi.fn().mockResolvedValue({}) };
      }),
    } as unknown as BaseChatModel;

    const node = makeAnalyzeSkepticalReconciliationNode(model);

    await expect(node(buildBaseState())).rejects.toBeInstanceOf(ZodError);

    expect(langsmith.logValidationFailure).toHaveBeenCalledWith(
      expect.objectContaining({
        nodeName: "analyze-skeptical-reconciliation",
        rawOutput: invalidOutput,
      }),
    );
  });

  // Test case 4 — validates the .min(1) fix: empty string is not a valid acknowledgement
  it("rejects with ZodError when LLM returns acknowledgement as empty string", async () => {
    const invalidOutput = { ...validLLMOutput, acknowledgement: "" };

    const model = {
      bind: vi.fn().mockReturnThis(),
      withStructuredOutput: vi.fn().mockImplementation((schema: unknown) => {
        if (schema === HonestVerdictLLMSchema) {
          return { invoke: vi.fn().mockResolvedValue(invalidOutput) };
        }
        return { invoke: vi.fn().mockResolvedValue({}) };
      }),
    } as unknown as BaseChatModel;

    const node = makeAnalyzeSkepticalReconciliationNode(model);

    await expect(node(buildBaseState())).rejects.toBeInstanceOf(ZodError);
  });
});

// ---------------------------------------------------------------------------
// Test cases 5, 6, 7, 8 — guards
// ---------------------------------------------------------------------------

describe("analyzeSkepticalReconciliation — guards", () => {
  // Test case 5
  it("throws when matchResult is missing", async () => {
    const node = makeAnalyzeSkepticalReconciliationNode(buildMockModel());
    await expect(
      node(buildBaseState({ matchResult: undefined })),
    ).rejects.toThrow("matchResult is missing");
  });

  // Test case 6
  it("throws when resumeData is missing", async () => {
    const node = makeAnalyzeSkepticalReconciliationNode(buildMockModel());
    await expect(
      node(buildBaseState({ resumeData: undefined })),
    ).rejects.toThrow("resumeData is missing");
  });

  // Test case 7
  it("throws when jobData is missing", async () => {
    const node = makeAnalyzeSkepticalReconciliationNode(buildMockModel());
    await expect(
      node(buildBaseState({ jobData: undefined })),
    ).rejects.toThrow("jobData is missing");
  });

  // Test case 8
  it("throws when scenarioId is not honest_verdict", async () => {
    const node = makeAnalyzeSkepticalReconciliationNode(buildMockModel());
    await expect(
      node(buildBaseState({ scenarioId: "narrative_gap" })),
    ).rejects.toThrow('expected scenarioId "honest_verdict"');
  });
});
