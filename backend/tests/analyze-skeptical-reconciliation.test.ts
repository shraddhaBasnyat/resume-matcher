import { describe, it, expect, vi, beforeEach } from "vitest";
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
  RootRunCapture: function RootRunCapture(
    this: Record<string, unknown>,
    _callback: (id: string) => void,
  ) {},
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
  honestAssessment: [
    "The gap is real — you have three years of frontend work but this role requires five or more years of backend systems experience.",
    "Distributed architecture ownership does not appear anywhere in your history.",
  ],
  closingSteps: [
    "Build and ship a production backend service end-to-end — API design, data layer, deployment.",
    "Take on infrastructure ownership in your current role: own a service from incident to postmortem.",
  ],
  acknowledgement: null,
  contextPrompt: null,
};

const validLLMOutputWithContextPrompt = {
  ...validLLMOutput,
  contextPrompt: "Can you describe any production backend systems you have shipped?",
};

const validLLMOutputWithAck = {
  ...validLLMOutput,
  acknowledgement: [
    "Your freelance backend projects show initiative, but the scope and scale fall short of what this role requires at a senior level.",
  ],
};

const validFitAnalysis = {
  careerTrajectory: "Frontend development over 3 years at a web agency",
  keyStrengths: ["JavaScript", "React", "CSS"],
  experienceGaps: [
    "No backend architecture ownership",
    "No distributed systems experience",
    "Experience level is junior relative to role requirements",
  ],
};

function buildBaseState(overrides: Partial<Record<string, unknown>> = {}): GraphStateType {
  return {
    resumeText: "Jordan Lee resume text",
    jobText: "Senior Backend Engineer at Infra Corp",
    humanContext: "",
    fitScore: 38,
    headline: "Frontend Developer without backend systems depth",
    battleCardBullets: ["3 years of React", "Strong CSS fundamentals"],
    scenarioSummary: "Frontend background does not map to this senior backend role.",
    sourceRole: "frontend_swe",
    targetRole: "backend_swe",
    fitAnalysis: validFitAnalysis,
    weakMatch: true,
    weakMatchReason:
      "Three of five required skills are absent and the candidate's experience level is too junior for a senior backend role.",
    threadId: undefined,
    intent: undefined,
    intentContext: undefined,
    hitlFired: false,
    userTier: "base",
    atsProfile: undefined,
    scenarioId: "honest_verdict",
    fitAdvice: undefined,
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

beforeEach(() => {
  vi.clearAllMocks();
});

// ---------------------------------------------------------------------------
// Test case 1 — contextPrompt null: chain runs, fitAdvice written, no interrupt
// ---------------------------------------------------------------------------

describe("analyzeSkepticalReconciliation — contextPrompt null path", () => {
  it("LLM runs and fitAdvice is written with scenarioId honest_verdict and acknowledgement null", async () => {
    const node = makeAnalyzeSkepticalReconciliationNode(buildMockModel());
    const result = await node(buildBaseState());
    const advice = result.fitAdvice as Record<string, unknown>;

    expect(advice.scenarioId).toBe("honest_verdict");
    expect(Array.isArray(advice.honestAssessment)).toBe(true);
    expect(Array.isArray(advice.closingSteps)).toBe(true);
    expect(advice.acknowledgement).toBeNull();
    // contextPrompt must not be written to fitAdvice
    expect(advice.contextPrompt).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// Test case 2 — hitlFired true: chain runs with humanContext, acknowledgement non-null
// ---------------------------------------------------------------------------

describe("analyzeSkepticalReconciliation — hitlFired path", () => {
  it("LLM runs when hitlFired is true and acknowledgement is a non-null array", async () => {
    const node = makeAnalyzeSkepticalReconciliationNode(buildMockModel(validLLMOutputWithAck));
    const result = await node(
      buildBaseState({
        hitlFired: true,
        humanContext: "I have done freelance backend work for two years outside my main role.",
      }),
    );
    const advice = result.fitAdvice as Record<string, unknown>;

    expect(advice.scenarioId).toBe("honest_verdict");
    expect(Array.isArray(advice.acknowledgement)).toBe(true);
    expect((advice.acknowledgement as string[]).length).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// Test case — contextPrompt non-null: interrupt fires, Command returned with self-loop goto
// ---------------------------------------------------------------------------

describe("analyzeSkepticalReconciliation — interrupt path", () => {
  it("interrupt fires when chain returns non-null contextPrompt, Command goto is analyzeSkepticalReconciliation", async () => {
    const node = makeAnalyzeSkepticalReconciliationNode(
      buildMockModel(validLLMOutputWithContextPrompt),
    );
    const result = await node(buildBaseState());

    expect(langgraph.interrupt).toHaveBeenCalledWith(
      validLLMOutputWithContextPrompt.contextPrompt,
    );
    expect(result).toMatchObject({
      update: { humanContext: "user-provided context", hitlFired: true },
      goto: "analyzeSkepticalReconciliation",
    });
    // fitAdvice must not be written when interrupt fires
    expect((result as Record<string, unknown>).fitAdvice).toBeUndefined();
  });

  it("no interrupt when hitlFired is already true, even if chain returns contextPrompt", async () => {
    const node = makeAnalyzeSkepticalReconciliationNode(
      buildMockModel(validLLMOutputWithContextPrompt),
    );
    const result = await node(buildBaseState({ hitlFired: true }));
    const advice = result.fitAdvice as Record<string, unknown>;

    expect(langgraph.interrupt).not.toHaveBeenCalled();
    expect(advice.scenarioId).toBe("honest_verdict");
  });
});

// ---------------------------------------------------------------------------
// Validation failure
// ---------------------------------------------------------------------------

describe("analyzeSkepticalReconciliation — validation failure", () => {
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

  it("rejects with ZodError when acknowledgement is an empty string — must be array or null", async () => {
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

    await expect(
      makeAnalyzeSkepticalReconciliationNode(model)(buildBaseState()),
    ).rejects.toBeInstanceOf(ZodError);
  });
});

// ---------------------------------------------------------------------------
// Guards
// ---------------------------------------------------------------------------

describe("analyzeSkepticalReconciliation — guards", () => {
  it("throws when fitAnalysis is missing", async () => {
    const node = makeAnalyzeSkepticalReconciliationNode(buildMockModel());
    await expect(
      node(buildBaseState({ fitAnalysis: undefined })),
    ).rejects.toThrow("fitAnalysis is missing");
  });

  it("throws when scenarioId is not honest_verdict", async () => {
    const node = makeAnalyzeSkepticalReconciliationNode(buildMockModel());
    await expect(
      node(buildBaseState({ scenarioId: "narrative_gap" })),
    ).rejects.toThrow('expected scenarioId "honest_verdict"');
  });
});
