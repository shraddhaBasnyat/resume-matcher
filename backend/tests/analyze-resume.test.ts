import { describe, it, expect, vi, afterEach } from "vitest";
import { FakeListChatModel } from "@langchain/core/utils/testing";
import { makeAnalyzeResumeNode } from "../graphs/scoring/nodes/analyze-resume.js";
import { buildAnalyzeResumeRunnable } from "../llm-wrappers/analyze-resume.wrapper.js";
import type { GraphStateType } from "../graphs/scoring/scoring-graph-state.js";

afterEach(() => {
  vi.restoreAllMocks();
});

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const validLLMOutput = {
  candidateArchetype: "specialist_depth",
  demonstratedVsClaimed: [
    {
      bullet: "Built distributed streaming platform serving 40M users",
      status: "demonstrated",
      evidencePresent: "40M users, Kafka, 3 years at Quizlet",
    },
    {
      bullet: "Experience with agentic LLM systems",
      status: "claimed",
      evidencePresent: null,
    },
  ],
  careerArcNote: {
    transitions: [
      {
        from: "growth_hire",
        to: "specialist_depth",
        signal: "Early career generalist work gave way to platform engineering at Quizlet operating at 40M user scale",
      },
    ],
  },
  resumeAha: "Strong platform scale signals but no demonstrated AI agent work — claimed, not shown.",
};

function buildBaseState(overrides: Partial<Record<string, unknown>> = {}): GraphStateType {
  return {
    resumeText: "Jane Doe resume text — Senior Platform Engineer, Quizlet 2019–2022",
    jobText: "Senior Backend Engineer, AI Agent at Cresta",
    humanContext: "",
    jdArchetype: undefined,
    realAsk: undefined,
    recruiterFilter: undefined,
    candidateArchetype: undefined,
    demonstratedVsClaimed: undefined,
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

describe("makeAnalyzeResumeNode — valid output", () => {
  it("writes all analyzeResume fields to state", async () => {
    const mockModel = new FakeListChatModel({ responses: [JSON.stringify(validLLMOutput)] });
    const node = makeAnalyzeResumeNode(mockModel);

    const result = await node(buildBaseState());

    expect(result.candidateArchetype).toBe("specialist_depth");
    expect(Array.isArray(result.demonstratedVsClaimed)).toBe(true);
    expect(result.demonstratedVsClaimed).toHaveLength(2);
    expect(result.demonstratedVsClaimed[0].status).toBe("demonstrated");
    expect(result.demonstratedVsClaimed[1].status).toBe("claimed");
    expect(result.careerArcNote.transitions).toHaveLength(1);
    expect(result.resumeAha).toBe(validLLMOutput.resumeAha);
  });
});

// ---------------------------------------------------------------------------
// Validation failure
// ---------------------------------------------------------------------------

describe("AnalyzeResumeRunnable — validation failure", () => {
  it("logs console.error and throws ZodError when model returns invalid shape", async () => {
    const invalidOutput = {
      candidateArchetype: "not-an-archetype",
      demonstratedVsClaimed: "should-be-array",
    };

    const mockModel = new FakeListChatModel({ responses: [JSON.stringify(invalidOutput)] });
    const chain = buildAnalyzeResumeRunnable(mockModel);

    const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    await expect(
      chain.invoke({ resume_text: "resume text" }),
    ).rejects.toThrow(expect.objectContaining({ name: "ZodError" }));

    expect(consoleErrorSpy).toHaveBeenCalledWith(
      "[validation-failed] AnalyzeResumeRunnable",
      expect.anything(),
      invalidOutput,
    );
  });
});
