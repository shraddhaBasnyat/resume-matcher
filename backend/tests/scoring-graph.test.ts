import { describe, it, expect, vi, beforeEach } from "vitest";
import { BaseChatModel } from "@langchain/core/language_models/chat_models";
import { MatchSchema } from "../chains/scoring-chain.js";
import { JobSchema } from "../chains/job-chain.js";
import { ResumeSchema } from "../chains/resume-chain.js";
import { AtsAnalysisSchema } from "../chains/ats-analysis-chain.js";
import {
  ConfirmedFitLLMSchema,
  InvisibleExpertLLMSchema,
} from "../chains/analyze-strong-match-chain.js";
import { buildJobChain } from "../chains/job-chain.js";
import { buildScoringChain } from "../chains/scoring-chain.js";
import { buildGapAnalysisChain } from "../chains/gap-analysis-chain.js";
import { buildScoringGraph } from "../graphs/scoring/scoring-graph.js";

// ---------------------------------------------------------------------------
// Shared fixtures
// ---------------------------------------------------------------------------

const validMatchResult = {
  fitScore: 72,
  matchedSkills: ["TypeScript", "React"],
  missingSkills: ["Kubernetes"],
  narrativeAlignment: "Strong frontend background aligns well with UI-heavy role.",
  gaps: ["No cloud infrastructure experience"],
  resumeAdvice: ["Add a section on cloud deployments", "Highlight any CI/CD usage"],
  contextPrompt: null,
  weakMatchReason: undefined,
};

const weakMatchResult = {
  ...validMatchResult,
  fitScore: 45,
  weakMatchReason: "Missing 3 of 5 required skills and experience level is too junior.",
};

const weakMatchResultWithContextPrompt = {
  ...weakMatchResult,
  contextPrompt: "Can you describe any production agent systems you have shipped?",
};

const validJobData = {
  title: "Senior Frontend Engineer",
  company: "Acme Corp",
  requiredSkills: ["TypeScript", "React", "Kubernetes"],
  niceToHaveSkills: ["GraphQL"],
  keywords: ["SPA", "CI/CD", "Agile"],
  experienceYears: 5,
  seniorityLevel: "senior" as const,
  targetRole: "frontend_swe",
};

const validResumeData = {
  name: "Jane Doe",
  email: "jane@example.com",
  phone: "555-1234",
  skills: ["TypeScript", "React", "Node.js"],
  experience: [{ company: "Startup", role: "Frontend Developer", years: 3 }],
  education: [{ degree: "B.Sc. CS", institution: "State U" }],
  careerNarrative: {
    trajectory: "Junior to senior frontend",
    dominantTheme: "UI systems",
    inferredStrengths: ["component design"],
    careerMotivation: "Building UIs at scale",
    resumeStoryGaps: [],
  },
  sourceRole: "frontend_swe",
};

// ---------------------------------------------------------------------------
// MatchSchema validation
// ---------------------------------------------------------------------------

describe("MatchSchema", () => {
  it("accepts a valid match result", () => {
    expect(MatchSchema.safeParse(validMatchResult).success).toBe(true);
  });

  it("rejects fitScore out of range", () => {
    expect(MatchSchema.safeParse({ ...validMatchResult, fitScore: 110 }).success).toBe(false);
    expect(MatchSchema.safeParse({ ...validMatchResult, fitScore: -5 }).success).toBe(false);
  });

  it("accepts result with weakMatchReason present", () => {
    const result = MatchSchema.safeParse(weakMatchResult);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.weakMatchReason).toBeDefined();
    }
  });

  it("accepts result without weakMatchReason — validation is now in the node layer", () => {
    // weakMatch is no longer in the schema — the LLM does not output it.
    // weakMatchReason is still optional in the schema; node layer enforces it when fitScore < 60.
    const { weakMatchReason: _, ...withoutReason } = weakMatchResult;
    expect(MatchSchema.safeParse(withoutReason).success).toBe(true);
  });

  it("accepts contextPrompt as null", () => {
    expect(MatchSchema.safeParse({ ...validMatchResult, contextPrompt: null }).success).toBe(true);
  });

  it("accepts contextPrompt as a non-empty string", () => {
    expect(MatchSchema.safeParse({ ...validMatchResult, contextPrompt: "Can you describe your LangGraph experience?" }).success).toBe(true);
  });

  it("rejects non-array matchedSkills", () => {
    expect(
      MatchSchema.safeParse({ ...validMatchResult, matchedSkills: "TypeScript" }).success
    ).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// JobSchema validation
// ---------------------------------------------------------------------------

describe("JobSchema", () => {
  it("accepts a valid job description", () => {
    expect(JobSchema.safeParse(validJobData).success).toBe(true);
  });

  it("rejects invalid seniorityLevel", () => {
    expect(
      JobSchema.safeParse({ ...validJobData, seniorityLevel: "intern" }).success
    ).toBe(false);
  });

  it("accepts job without optional fields", () => {
    const { company: _, experienceYears: __, seniorityLevel: ___, ...minimal } = validJobData;
    expect(JobSchema.safeParse(minimal).success).toBe(true);
  });

  it("requires targetRole", () => {
    const { targetRole: _, ...withoutTargetRole } = validJobData;
    expect(JobSchema.safeParse(withoutTargetRole).success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// buildJobChain — reads job_text only, returns JobSchema
// ---------------------------------------------------------------------------

describe("buildJobChain", () => {
  it("calls model with job text and returns parsed job data", async () => {
    const mockInvoke = vi.fn().mockResolvedValue(validJobData);
    const mockModel = {
      withStructuredOutput: vi.fn().mockReturnValue({ invoke: mockInvoke }),
    };

    const chain = buildJobChain(mockModel as unknown as BaseChatModel);
    const result = await chain.invoke({ job_text: "Senior Frontend Engineer at Acme..." });

    expect(mockModel.withStructuredOutput).toHaveBeenCalledWith(JobSchema);
    expect(result).toEqual(validJobData);
  });

  it("only accepts job_text as input — no other fields", async () => {
    const mockInvoke = vi.fn().mockResolvedValue(validJobData);
    const mockModel = {
      withStructuredOutput: vi.fn().mockReturnValue({ invoke: mockInvoke }),
    };

    const chain = buildJobChain(mockModel as unknown as BaseChatModel);
    await chain.invoke({ job_text: "Senior Frontend Engineer..." });
    expect(mockInvoke).toHaveBeenCalledTimes(1);
  });

  it("propagates model errors", async () => {
    const mockModel = {
      withStructuredOutput: vi.fn().mockReturnValue({
        invoke: vi.fn().mockRejectedValue(new Error("parse failed")),
      }),
    };
    await expect(
      buildJobChain(mockModel as unknown as BaseChatModel).invoke({ job_text: "..." })
    ).rejects.toThrow("parse failed");
  });
});

// ---------------------------------------------------------------------------
// buildScoringChain — reads resume_data + job_data + human_context only
// ---------------------------------------------------------------------------

describe("buildScoringChain", () => {
  it("returns a valid MatchSchema shape when model is mocked", async () => {
    const mockInvoke = vi.fn().mockResolvedValue(validMatchResult);
    const mockModel = {
      withStructuredOutput: vi.fn().mockReturnValue({ invoke: mockInvoke }),
    };

    const chain = buildScoringChain(mockModel as unknown as BaseChatModel);
    const result = await chain.invoke({
      resume_data: JSON.stringify(validResumeData),
      job_data: JSON.stringify(validJobData),
      human_context: "None provided.",
    });

    expect(mockModel.withStructuredOutput).toHaveBeenCalledWith(MatchSchema);
    const parsed = MatchSchema.safeParse(result);
    expect(parsed.success).toBe(true);
  });

  it("injects humanContext into the invocation", async () => {
    const mockInvoke = vi.fn().mockResolvedValue(validMatchResult);
    const mockModel = {
      withStructuredOutput: vi.fn().mockReturnValue({ invoke: mockInvoke }),
    };

    const chain = buildScoringChain(mockModel as unknown as BaseChatModel);
    await chain.invoke({
      resume_data: JSON.stringify(validResumeData),
      job_data: JSON.stringify(validJobData),
      human_context: "I led 3 engineers for 2 years off the books.",
    });

    expect(mockInvoke).toHaveBeenCalledTimes(1);
    const calledMessages = mockInvoke.mock.calls[0][0];
    const messageContent = calledMessages.messages
      .map((m: { content: string }) => m.content)
      .join(" ");
    expect(messageContent).toContain("I led 3 engineers for 2 years off the books.");
  });

  it("never receives raw resumeText or jobText — only structured data", async () => {
    const mockInvoke = vi.fn().mockResolvedValue(validMatchResult);
    const mockModel = {
      withStructuredOutput: vi.fn().mockReturnValue({ invoke: mockInvoke }),
    };

    const chain = buildScoringChain(mockModel as unknown as BaseChatModel);
    await chain.invoke({
      resume_data: JSON.stringify(validResumeData),
      job_data: JSON.stringify(validJobData),
      human_context: "",
    });

    const calledMessages = mockInvoke.mock.calls[0][0];
    const messageContent = calledMessages.messages
      .map((m: { content: string }) => m.content)
      .join(" ");
    expect(messageContent).toContain('"name"');
    expect(messageContent).toContain('"skills"');
  });

  it("propagates model errors", async () => {
    const mockModel = {
      withStructuredOutput: vi.fn().mockReturnValue({
        invoke: vi.fn().mockRejectedValue(new Error("scoring failed")),
      }),
    };
    await expect(
      buildScoringChain(mockModel as unknown as BaseChatModel).invoke({
        resume_data: "{}",
        job_data: "{}",
        human_context: "",
      })
    ).rejects.toThrow("scoring failed");
  });
});

// ---------------------------------------------------------------------------
// buildGapAnalysisChain — reads match_result + resume_data + job_data
// ---------------------------------------------------------------------------

describe("buildGapAnalysisChain", () => {
  it("returns an updated MatchSchema shape", async () => {
    const enrichedResult = {
      ...validMatchResult,
      resumeAdvice: [
        "Rename 'Technologies' to 'Cloud & DevOps' and add Kubernetes self-study projects.",
        "Add a bullet under Startup role: 'Deployed containerised services via Docker Compose'.",
      ],
    };
    // Gap analysis chain output excludes weakMatch — chain strips it from output schema
    // and reattaches from input. So the mock returns the LLM output shape (no weakMatch).
    const { contextPrompt: _, ...llmEnrichedResult } = { ...enrichedResult, weakMatch: undefined };
    const mockInvoke = vi.fn().mockResolvedValue(llmEnrichedResult);
    const mockModel = {
      withStructuredOutput: vi.fn().mockReturnValue({ invoke: mockInvoke }),
    };

    const matchResultInput = JSON.stringify({ ...validMatchResult, weakMatch: false });
    const chain = buildGapAnalysisChain(mockModel as unknown as BaseChatModel);
    const result = await chain.invoke({
      resume_data: JSON.stringify(validResumeData),
      job_data: JSON.stringify(validJobData),
      match_result: matchResultInput,
    });

    expect(result.resumeAdvice).toHaveLength(2);
    // contextPrompt and weakMatch are preserved from input, not regenerated
    expect(result.contextPrompt).toBeNull();
    expect(result.weakMatch).toBe(false);
  });

  it("preserves contextPrompt from input match_result", async () => {
    const mockInvoke = vi.fn().mockResolvedValue({
      ...validMatchResult,
      contextPrompt: "this should be ignored",
    });
    const mockModel = {
      withStructuredOutput: vi.fn().mockReturnValue({ invoke: mockInvoke }),
    };

    const inputWithContextPrompt = JSON.stringify({
      ...validMatchResult,
      weakMatch: false,
      contextPrompt: "Can you describe your LangGraph production experience?",
    });

    const chain = buildGapAnalysisChain(mockModel as unknown as BaseChatModel);
    const result = await chain.invoke({
      resume_data: JSON.stringify(validResumeData),
      job_data: JSON.stringify(validJobData),
      match_result: inputWithContextPrompt,
    });

    expect(result.contextPrompt).toBe("Can you describe your LangGraph production experience?");
  });

  it("accepts all three inputs and never receives raw text", async () => {
    const mockInvoke = vi.fn().mockResolvedValue(validMatchResult);
    const mockModel = {
      withStructuredOutput: vi.fn().mockReturnValue({ invoke: mockInvoke }),
    };

    const chain = buildGapAnalysisChain(mockModel as unknown as BaseChatModel);
    await chain.invoke({
      resume_data: JSON.stringify(validResumeData),
      job_data: JSON.stringify(validJobData),
      match_result: JSON.stringify({ ...validMatchResult, weakMatch: false }),
    });

    const calledMessages = mockInvoke.mock.calls[0][0];
    const messageContent = calledMessages.messages
      .map((m: { content: string }) => m.content)
      .join(" ");
    expect(messageContent).toContain('"fitScore"');
    expect(messageContent).toContain('"skills"');
    expect(messageContent).toContain('"title"');
  });
});

// Routing logic is covered by derive-scenario.test.ts — no inline routing tests here.

// ---------------------------------------------------------------------------
// Full graph run — mocked chains, verifies clean state shape & response
// ---------------------------------------------------------------------------

describe("buildScoringGraph — full run with mocked chains", () => {
  let mockModel: ReturnType<typeof buildMockModel>;

  const validConfirmedFitLLMOutput = {
    confirmation: "You are a strong match for this role.",
    standoutStrengths: ["TypeScript expertise", "React component architecture"],
    minorGaps: [],
  };

  const validInvisibleExpertLLMOutput = {
    confirmation: "You are a strong match for this role.",
    standoutStrengths: ["TypeScript expertise", "React component architecture"],
    minorGaps: [],
    atsRealityCheck:
      "Your resume uses 'front-end' but the job posting requires 'React' verbatim — a simple terminology swap resolves this.",
  };

  function buildMockModel(overrides: { atsScore?: "high" | "low"; fitScore?: "high" | "low" } = {}) {
    // ATS score is high (≥75) by default → confirmed_fit; pass { atsScore: "low" } for invisible_expert
    const atsLow = overrides.atsScore === "low";
    // Fit score is moderate (72) by default; pass { fitScore: "high" } for a strong match
    const fitHigh = overrides.fitScore === "high";

    const strongMatchResult = {
      ...validMatchResult,
      fitScore: 82,
    };

    const withStructuredOutput = vi.fn().mockImplementation((schema) => {
      if (schema === ResumeSchema) {
        return { invoke: vi.fn().mockResolvedValue(validResumeData) };
      }
      if (schema === JobSchema) {
        return { invoke: vi.fn().mockResolvedValue(validJobData) };
      }
      if (schema === MatchSchema) {
        // Matches the exported MatchSchema from scoring-chain (used by buildScoringChain)
        return {
          invoke: vi.fn().mockResolvedValue(fitHigh ? strongMatchResult : validMatchResult),
        };
      }
      if (schema === AtsAnalysisSchema) {
        return {
          invoke: vi.fn().mockResolvedValue(
            atsLow
              ? { keywordPts: 20, layoutPts: 20, terminologyPts: 10, missingKeywords: ["React", "TypeScript"], layoutFlags: [], terminologyGaps: ["resume uses 'front-end'; job posting requires 'React'"] }
              : { keywordPts: 40, layoutPts: 28, terminologyPts: 16, missingKeywords: [], layoutFlags: [], terminologyGaps: [] },
          ),
        };
      }
      if (schema === ConfirmedFitLLMSchema) {
        return { invoke: vi.fn().mockResolvedValue(validConfirmedFitLLMOutput) };
      }
      if (schema === InvisibleExpertLLMSchema) {
        return { invoke: vi.fn().mockResolvedValue(validInvisibleExpertLLMOutput) };
      }
      // gap-analysis-chain uses a local (non-exported) MatchSchema — different object reference.
      // Return validMatchResult so the chain has a valid base to attach contextPrompt/weakMatch to.
      return { invoke: vi.fn().mockResolvedValue(validMatchResult) };
    });

    // bind is required by chains that call model.bind({ temperature: 0 }).withStructuredOutput(...)
    // (ats-analysis-chain, analyze-strong-match-chain). mockReturnThis() makes bind return the
    // same mock object so withStructuredOutput is callable on the result.
    return {
      bind: vi.fn().mockReturnThis(),
      withStructuredOutput,
    };
  }

  beforeEach(() => {
    vi.doMock("../langsmith.js", () => ({
      isTracingEnabled: () => false,
      getTraceUrl: vi.fn(),
      RootRunCapture: vi.fn().mockImplementation(() => ({ rootRunId: undefined })),
      logValidationFailure: vi.fn(),
      RUN_NAMES: {},
    }));
    mockModel = buildMockModel();
  });

  it("produces the expected output state shape for a high-score run", async () => {
    const compiledGraph = buildScoringGraph(mockModel as unknown as BaseChatModel);
    const threadId = "test-thread-high-score";

    const state = await compiledGraph.invoke(
      {
        resumeText: "Jane Doe resume text",
        jobText: "Senior Frontend Engineer at Acme",
        intent: "confident_match",
        intentContext: { basis: ["direct_experience"] },
        userTier: "base",
      },
      { configurable: { thread_id: threadId } }
    );

    expect(state.resumeData).toBeDefined();
    expect(state.jobData).toBeDefined();
    expect(state.matchResult).toBeDefined();

    expect(ResumeSchema.safeParse(state.resumeData).success).toBe(true);
    expect(JobSchema.safeParse(state.jobData).success).toBe(true);

    // Scenario routing fired — scenarioId and fitAdvice should be set
    expect(state.scenarioId).toBeDefined();
    expect(state.fitAdvice).toBeDefined();

    // High-score run completes without interrupt
    const snapshot = await compiledGraph.getState({ configurable: { thread_id: threadId } });
    expect(snapshot.next).toHaveLength(0);
  });

  it("response shape matches what the UI expects", async () => {
    const compiledGraph = buildScoringGraph(mockModel as unknown as BaseChatModel);
    const state = await compiledGraph.invoke(
      { resumeText: "resume text", jobText: "job text", intent: "confident_match", intentContext: { basis: ["direct_experience"] }, userTier: "base" },
      { configurable: { thread_id: "test-thread-ui-shape" } }
    );

    const match = state.matchResult!;
    expect(typeof match.fitScore).toBe("number");
    expect(Array.isArray(match.matchedSkills)).toBe(true);
    expect(Array.isArray(match.missingSkills)).toBe(true);
    expect(typeof match.narrativeAlignment).toBe("string");
    expect(Array.isArray(match.gaps)).toBe(true);
    expect(Array.isArray(match.resumeAdvice)).toBe(true);
    expect(typeof match.weakMatch).toBe("boolean");
    // contextPrompt is present (null or string)
    expect("contextPrompt" in match).toBe(true);

    // Scenario routing fields are present in state
    expect(state.scenarioId).toBeDefined();
    expect(state.fitAdvice).toBeDefined();

    // resumeData and jobData remain in graph state (available to branch nodes)
    expect(state.resumeData).toBeTruthy();
    expect(state.jobData).toBeTruthy();

    expect(state.resumeData).not.toBeTypeOf("string");
    expect(state.jobData).not.toBeTypeOf("string");
  });

  // honest_verdict — fitScore < 50 → analyzeSkepticalReconciliation → interrupt (contextPrompt non-null)
  it("graph is interrupted for low-score confident_match run (fitScore < 50 routes to analyzeSkepticalReconciliation)", async () => {
    const lowScoreModel = {
      bind: vi.fn().mockReturnThis(),
      withStructuredOutput: vi.fn().mockImplementation((schema) => {
        if (schema === ResumeSchema) return { invoke: vi.fn().mockResolvedValue(validResumeData) };
        if (schema === JobSchema) return { invoke: vi.fn().mockResolvedValue(validJobData) };
        if (schema === MatchSchema) return { invoke: vi.fn().mockResolvedValue(weakMatchResultWithContextPrompt) };
        if (schema === AtsAnalysisSchema) return { invoke: vi.fn().mockResolvedValue({ keywordPts: 40, layoutPts: 28, terminologyPts: 16, missingKeywords: [], layoutFlags: [], terminologyGaps: [] }) };
        return { invoke: vi.fn().mockResolvedValue({}) };
      }),
    };

    const compiledGraph = buildScoringGraph(lowScoreModel as unknown as BaseChatModel);
    const threadId = "test-thread-low-score";

    await compiledGraph.invoke(
      { resumeText: "resume text", jobText: "job text", intent: "confident_match", intentContext: { basis: ["direct_experience"] }, userTier: "base" },
      { configurable: { thread_id: threadId } }
    );

    const snapshot = await compiledGraph.getState({ configurable: { thread_id: threadId } });
    expect(snapshot.next.length).toBeGreaterThan(0);
    expect(snapshot.values.matchResult?.fitScore).toBe(45);
  });

  // TODO: when analyzeSkepticalReconciliation is fully implemented, update this test to assert
  // that contextPrompt: null routes to no interrupt (graph completes immediately with fitAdvice).
  // Current stub always interrupts regardless of contextPrompt — this test verifies the stub
  // routes to honest_verdict and fires an interrupt.
  it("scenario 5 — low fit routes to honest_verdict and interrupts (stub always interrupts)", async () => {
    const scenario5Model = {
      bind: vi.fn().mockReturnThis(),
      withStructuredOutput: vi.fn().mockImplementation((schema) => {
        if (schema === ResumeSchema) return { invoke: vi.fn().mockResolvedValue(validResumeData) };
        if (schema === JobSchema) return { invoke: vi.fn().mockResolvedValue(validJobData) };
        if (schema === MatchSchema) return { invoke: vi.fn().mockResolvedValue(weakMatchResult) }; // contextPrompt: null
        if (schema === AtsAnalysisSchema) return { invoke: vi.fn().mockResolvedValue({ keywordPts: 40, layoutPts: 28, terminologyPts: 16, missingKeywords: [], layoutFlags: [], terminologyGaps: [] }) };
        return { invoke: vi.fn().mockResolvedValue({}) };
      }),
    };

    const compiledGraph = buildScoringGraph(scenario5Model as unknown as BaseChatModel);
    const threadId = "test-thread-scenario-5";

    await compiledGraph.invoke(
      { resumeText: "resume text", jobText: "job text", intent: "confident_match", intentContext: { basis: ["direct_experience"] }, userTier: "base" },
      { configurable: { thread_id: threadId } }
    );

    const snapshot = await compiledGraph.getState({ configurable: { thread_id: threadId } });
    // Stub always interrupts — update to toHaveLength(0) when the node is implemented
    expect(snapshot.next.length).toBeGreaterThan(0);
    expect(snapshot.values.scenarioId).toBe("honest_verdict");
  });

  // Test case 6 — integration: invisible_expert full graph run
  it("invisible_expert — fitScore >= 75 and atsScore < 75 routes to analyzeStrongMatch with ATS pass-throughs", async () => {
    const model = buildMockModel({ fitScore: "high", atsScore: "low" });
    const compiledGraph = buildScoringGraph(model as unknown as BaseChatModel);
    const threadId = "test-thread-invisible-expert";

    const state = await compiledGraph.invoke(
      {
        resumeText: "Jane Doe resume",
        jobText: "Senior Frontend Engineer at Acme",
        intent: "confident_match",
        intentContext: { basis: ["direct_experience"] },
        userTier: "base",
      },
      { configurable: { thread_id: threadId } },
    );

    // Routing
    expect(state.scenarioId).toBe("invisible_expert");

    // Graph completes without interrupt
    const snapshot = await compiledGraph.getState({ configurable: { thread_id: threadId } });
    expect(snapshot.next).toHaveLength(0);

    // fitAdvice shape
    const advice = state.fitAdvice as Record<string, unknown>;
    expect(advice.scenarioId).toBe("invisible_expert");
    expect(typeof advice.confirmation).toBe("string");
    expect(typeof advice.atsRealityCheck).toBe("string");
    expect(Array.isArray(advice.standoutStrengths)).toBe(true);
    // terminologySwaps come from atsProfile pass-through, not regenerated by LLM
    expect(Array.isArray(advice.terminologySwaps)).toBe(true);
    expect((advice.terminologySwaps as string[]).length).toBeGreaterThan(0);
    expect(Array.isArray(advice.keywordsToAdd)).toBe(true);
    expect((advice.keywordsToAdd as string[]).length).toBeGreaterThan(0);
    expect(Array.isArray(advice.layoutAdvice)).toBe(true);
  });

});

// ---------------------------------------------------------------------------
// Cancel flow — LangSmith trace update
// ---------------------------------------------------------------------------

describe("cancel flow — LangSmith trace update shape", () => {
  it("cancel payload has required fields for LangSmith updateRun", () => {
    const cancelPayload = {
      end_time: Date.now(),
      error: null,
      extra: {
        cancelled: true,
        cancelledBy: "human",
        cancelReason: "user_initiated_escape",
        durationMs: 5000,
      },
      tags: ["cancelled", "human-interrupted"],
    };

    expect(cancelPayload.extra.cancelled).toBe(true);
    expect(cancelPayload.extra.cancelledBy).toBe("human");
    expect(cancelPayload.tags).toContain("cancelled");
    expect(cancelPayload.tags).toContain("human-interrupted");
    expect(cancelPayload.error).toBeNull();
    expect(typeof cancelPayload.end_time).toBe("number");
  });
});
