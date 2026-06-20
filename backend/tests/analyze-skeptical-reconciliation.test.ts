import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { ZodError } from "zod";
import { FakeListChatModel } from "@langchain/core/utils/testing";
import { makeAnalyzeSkepticalReconciliationNode } from "../graphs/scoring/nodes/analyze-skeptical-reconciliation.js";
import type { GraphStateType } from "../graphs/scoring/scoring-graph-state.js";
import * as langgraph from "@langchain/langgraph";

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
  closingSummary: "The gap is real and the score stands — this is a 2–3 year development path, not a framing problem.",
  verdictAha: "The honest assessment cards explain specifically why — start there before deciding whether to apply.",
  terminologyDiffs: [],
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
    battleCardBullets: [
      { requirement: "React experience", evidence: "3 years of React", verdict: "strong_match" as const },
      { requirement: "CSS proficiency", evidence: "Strong CSS fundamentals", verdict: "strong_match" as const },
    ],
    fitScenarioSummary: "Frontend background does not map to this senior backend role.",
    fitAha: "Three years of frontend work — the core backend skills this role requires are absent.",
    sourceRole: "frontend_swe",
    targetRole: "backend_swe",
    fitAnalysis: validFitAnalysis,
    weakMatch: true,
    weakMatchReason:
      "Three of five required skills are absent and the candidate's experience level is too junior for a senior backend role.",
    atsScore: null,
    atsScenarioSummary: "Resume is parseable. No knockout risks. Low keyword match on backend infrastructure terms.",
    atsAha: "Missing 'distributed systems' and 'infrastructure ownership' — terms the recruiter filters for.",
    jdArchetype: { ideal: "specialist_depth" as const, couldWork: [] },
    candidateArchetype: "specialist_depth" as const,
    scopeAmbiguity: [],
    terminologyMismatches: [],
    threadId: undefined,
    intent: undefined,
    intentContext: undefined,
    hitlFired: false,
    userTier: "base",
    scenarioId: "honest_verdict",
    fitAdvice: undefined,
    closingSummary: undefined,
    verdictAha: undefined,
    ...overrides,
  } as unknown as GraphStateType;
}

function buildMockModel(llmReturn: Record<string, unknown> = validLLMOutput) {
  return new FakeListChatModel({ responses: [JSON.stringify(llmReturn)] });
}

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  vi.restoreAllMocks();
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
    // closingSummary and verdictAha are top-level state fields, not inside fitAdvice
    expect(advice.closingSummary).toBeUndefined();
    expect(advice.verdictAha).toBeUndefined();
    expect((result as Record<string, unknown>).closingSummary).toBeDefined();
    expect((result as Record<string, unknown>).verdictAha).toBeDefined();
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
    // closingSummary and verdictAha must NOT be in the Command update — node interrupts before writing them
    const update = (result as Record<string, unknown>).update as Record<string, unknown>;
    expect(update.closingSummary).toBeUndefined();
    expect(update.verdictAha).toBeUndefined();
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

    const model = new FakeListChatModel({ responses: [JSON.stringify(invalidOutput)] });

    const node = makeAnalyzeSkepticalReconciliationNode(model);

    const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    await expect(node(buildBaseState())).rejects.toBeInstanceOf(ZodError);

    expect(consoleErrorSpy).toHaveBeenCalledWith(
      "[validation-failed] HonestVerdictRunnable",
      expect.anything(),
      invalidOutput,
    );
  });

  it("rejects with ZodError when acknowledgement is an empty string — must be array or null", async () => {
    const invalidOutput = { ...validLLMOutput, acknowledgement: "" };

    const model = new FakeListChatModel({ responses: [JSON.stringify(invalidOutput)] });

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

  it("throws when fitScenarioSummary is missing", async () => {
    const node = makeAnalyzeSkepticalReconciliationNode(buildMockModel());
    await expect(
      node(buildBaseState({ fitScenarioSummary: undefined })),
    ).rejects.toThrow("fitScenarioSummary is missing");
  });

  it("throws when jdArchetype is missing", async () => {
    const node = makeAnalyzeSkepticalReconciliationNode(buildMockModel());
    await expect(
      node(buildBaseState({ jdArchetype: undefined })),
    ).rejects.toThrow("jdArchetype is missing");
  });

});
