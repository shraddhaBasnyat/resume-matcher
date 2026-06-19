import { describe, it, expect, vi, afterEach } from "vitest";
import { FakeListChatModel } from "@langchain/core/utils/testing";
import { makeAnalyzeJDNode } from "../graphs/scoring/nodes/analyze-jd.js";
import { buildAnalyzeJDRunnable } from "../llm-wrappers/analyze-jd.wrapper.js";
import type { GraphStateType } from "../graphs/scoring/scoring-graph-state.js";

afterEach(() => {
  vi.restoreAllMocks();
});

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const validLLMOutput = {
  jdArchetype: {
    ideal: "specialist_depth",
    couldWork: ["scale_operator"],
  },
  realAsk: "Build and operate production AI agent backends — LangGraph-based orchestration at Cresta scale.",
  recruiterFilter: "LangGraph, LangChain, agent, agentic, production AI infrastructure",
};

function buildBaseState(overrides: Partial<Record<string, unknown>> = {}): GraphStateType {
  return {
    resumeText: "Jane Doe resume text",
    jobText: "Senior Backend Engineer, AI Agent at Cresta",
    humanContext: "",
    jdArchetype: undefined,
    realAsk: undefined,
    recruiterFilter: undefined,
    candidateArchetype: undefined,
    demonstratedVsClaimed: undefined,
    scopeAmbiguity: undefined,
    careerArcNote: undefined,
    resumeAha: undefined,
    atsScore: undefined,
    termGaps: undefined,
    terminologyMismatches: undefined,
    formattingFlags: undefined,
    fitScore: undefined,
    headline: undefined,
    battleCardBullets: undefined,
    fitScenarioSummary: undefined,
    fitAha: undefined,
    sourceRole: undefined,
    targetRole: undefined,
    fitAnalysis: undefined,
    weakMatch: undefined,
    weakMatchReason: undefined,
    atsScenarioSummary: undefined,
    atsAha: undefined,
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
  } as GraphStateType;
}

// ---------------------------------------------------------------------------
// Node integration — valid output
// ---------------------------------------------------------------------------

describe("makeAnalyzeJDNode — valid output", () => {
  it("writes jdArchetype, realAsk, recruiterFilter to state", async () => {
    const mockModel = new FakeListChatModel({ responses: [JSON.stringify(validLLMOutput)] });
    const node = makeAnalyzeJDNode(mockModel);

    const result = await node(buildBaseState());

    expect(result.jdArchetype).toEqual(validLLMOutput.jdArchetype);
    expect(result.realAsk).toBe(validLLMOutput.realAsk);
    expect(result.recruiterFilter).toBe(validLLMOutput.recruiterFilter);
  });
});

// ---------------------------------------------------------------------------
// Validation failure
// ---------------------------------------------------------------------------

describe("AnalyzeJDRunnable — validation failure", () => {
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
