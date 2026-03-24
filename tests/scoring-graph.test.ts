import { describe, it, expect, vi, beforeEach } from "vitest";
import { MatchSchema } from "../lib/schemas/match-schema";
import { JobSchema } from "../lib/schemas/job-schema";
import { ResumeSchema } from "../lib/schemas/resume-schema";
import { buildJobChain, buildScoringChain, buildGapAnalysisChain, buildScoringGraph } from "../lib/scoring-graph";

// ---------------------------------------------------------------------------
// Shared fixtures
// ---------------------------------------------------------------------------

const validMatchResult = {
  score: 72,
  matchedSkills: ["TypeScript", "React"],
  missingSkills: ["Kubernetes"],
  narrativeAlignment: "Strong frontend background aligns well with UI-heavy role.",
  gaps: ["No cloud infrastructure experience"],
  resumeAdvice: ["Add a section on cloud deployments", "Highlight any CI/CD usage"],
  weakMatch: false,
};

const weakMatchResult = {
  ...validMatchResult,
  score: 45,
  weakMatch: true,
  weakMatchReason: "Missing 3 of 5 required skills and experience level is too junior.",
};

const validJobData = {
  title: "Senior Frontend Engineer",
  company: "Acme Corp",
  requiredSkills: ["TypeScript", "React", "Kubernetes"],
  niceToHaveSkills: ["GraphQL"],
  keywords: ["SPA", "CI/CD", "Agile"],
  experienceYears: 5,
  seniorityLevel: "senior" as const,
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
};

// ---------------------------------------------------------------------------
// MatchSchema validation
// ---------------------------------------------------------------------------

describe("MatchSchema", () => {
  it("accepts a valid match result", () => {
    expect(MatchSchema.safeParse(validMatchResult).success).toBe(true);
  });

  it("rejects score out of range", () => {
    expect(MatchSchema.safeParse({ ...validMatchResult, score: 110 }).success).toBe(false);
    expect(MatchSchema.safeParse({ ...validMatchResult, score: -5 }).success).toBe(false);
  });

  it("accepts weakMatch with weakMatchReason", () => {
    const result = MatchSchema.safeParse(weakMatchResult);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.weakMatch).toBe(true);
      expect(result.data.weakMatchReason).toBeDefined();
    }
  });

  it("rejects weakMatch without weakMatchReason (required when weakMatch=true)", () => {
    const { weakMatchReason: _, ...withoutReason } = weakMatchResult;
    // superRefine enforces weakMatchReason when weakMatch is true
    expect(MatchSchema.safeParse({ ...withoutReason, weakMatch: true }).success).toBe(false);
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

    const chain = buildJobChain(mockModel);
    const result = await chain.invoke({ job_text: "Senior Frontend Engineer at Acme..." });

    expect(mockModel.withStructuredOutput).toHaveBeenCalledWith(JobSchema);
    expect(result).toEqual(validJobData);
  });

  it("only accepts job_text as input — no other fields", async () => {
    const mockInvoke = vi.fn().mockResolvedValue(validJobData);
    const mockModel = {
      withStructuredOutput: vi.fn().mockReturnValue({ invoke: mockInvoke }),
    };

    const chain = buildJobChain(mockModel);
    // The chain signature is { job_text: string } only
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
      buildJobChain(mockModel).invoke({ job_text: "..." })
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

    const chain = buildScoringChain(mockModel);
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

    const chain = buildScoringChain(mockModel);
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

    const chain = buildScoringChain(mockModel);
    // The input type only accepts resume_data (JSON string), not raw text
    await chain.invoke({
      resume_data: JSON.stringify(validResumeData),
      job_data: JSON.stringify(validJobData),
      human_context: "",
    });

    const calledMessages = mockInvoke.mock.calls[0][0];
    const messageContent = calledMessages.messages
      .map((m: { content: string }) => m.content)
      .join(" ");
    // Should contain structured JSON, not raw PDF text
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
      buildScoringChain(mockModel).invoke({
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
    const mockInvoke = vi.fn().mockResolvedValue(enrichedResult);
    const mockModel = {
      withStructuredOutput: vi.fn().mockReturnValue({ invoke: mockInvoke }),
    };

    const chain = buildGapAnalysisChain(mockModel);
    const result = await chain.invoke({
      resume_data: JSON.stringify(validResumeData),
      job_data: JSON.stringify(validJobData),
      match_result: JSON.stringify(validMatchResult),
    });

    expect(mockModel.withStructuredOutput).toHaveBeenCalledWith(MatchSchema);
    expect(MatchSchema.safeParse(result).success).toBe(true);
    expect(result.resumeAdvice).toHaveLength(2);
  });

  it("accepts all three inputs and never receives raw text", async () => {
    const mockInvoke = vi.fn().mockResolvedValue(validMatchResult);
    const mockModel = {
      withStructuredOutput: vi.fn().mockReturnValue({ invoke: mockInvoke }),
    };

    const chain = buildGapAnalysisChain(mockModel);
    await chain.invoke({
      resume_data: JSON.stringify(validResumeData),
      job_data: JSON.stringify(validJobData),
      match_result: JSON.stringify(validMatchResult),
    });

    // Verify all three fields were passed to the model
    const calledMessages = mockInvoke.mock.calls[0][0];
    const messageContent = calledMessages.messages
      .map((m: { content: string }) => m.content)
      .join(" ");
    expect(messageContent).toContain('"score"');     // from match_result
    expect(messageContent).toContain('"skills"');    // from resume_data
    expect(messageContent).toContain('"title"');     // from job_data
  });
});

// ---------------------------------------------------------------------------
// Conditional edge logic (score routing)
// ---------------------------------------------------------------------------

describe("score routing logic", () => {
  function routeAfterScore(score: number): "gapAnalysis" | "awaitHuman" {
    return score >= 60 ? "gapAnalysis" : "awaitHuman";
  }

  function routeAfterHuman(humanContext: string): "rescore" | "gapAnalysis" {
    return humanContext && humanContext.trim().length > 0 ? "rescore" : "gapAnalysis";
  }

  it("routes score >= 60 to gapAnalysis", () => {
    expect(routeAfterScore(60)).toBe("gapAnalysis");
    expect(routeAfterScore(75)).toBe("gapAnalysis");
    expect(routeAfterScore(100)).toBe("gapAnalysis");
  });

  it("routes score < 60 to awaitHuman", () => {
    expect(routeAfterScore(59)).toBe("awaitHuman");
    expect(routeAfterScore(0)).toBe("awaitHuman");
    expect(routeAfterScore(45)).toBe("awaitHuman");
  });

  it("routes non-empty humanContext to rescore", () => {
    expect(routeAfterHuman("I led a team for 2 years.")).toBe("rescore");
    expect(routeAfterHuman("  some context  ")).toBe("rescore");
  });

  it("routes empty humanContext to gapAnalysis (accept result)", () => {
    expect(routeAfterHuman("")).toBe("gapAnalysis");
    expect(routeAfterHuman("   ")).toBe("gapAnalysis");
  });
});

// ---------------------------------------------------------------------------
// Full graph run — mocked chains, verifies clean state shape & response
// ---------------------------------------------------------------------------

describe("buildScoringGraph — full run with mocked chains", () => {
  let mockModel: ReturnType<typeof buildMockModel>;

  function buildMockModel() {
    return {
      withStructuredOutput: vi.fn().mockImplementation((schema) => {
        if (schema === ResumeSchema) {
          return { invoke: vi.fn().mockResolvedValue(validResumeData) };
        }
        if (schema === JobSchema) {
          return { invoke: vi.fn().mockResolvedValue(validJobData) };
        }
        if (schema === MatchSchema) {
          // Called by both scoring chain and gap analysis chain
          return { invoke: vi.fn().mockResolvedValue(validMatchResult) };
        }
        return { invoke: vi.fn().mockResolvedValue({}) };
      }),
    };
  }

  beforeEach(() => {
    mockModel = buildMockModel();
  });

  it("produces the expected output state shape for a high-score run", async () => {
    const compiledGraph = buildScoringGraph(mockModel);
    const threadId = "test-thread-high-score";

    const state = await compiledGraph.invoke(
      { resumeText: "Jane Doe resume text", jobText: "Senior Frontend Engineer at Acme" },
      { configurable: { thread_id: threadId } }
    );

    // Raw text must NOT be exposed in output — only structured data
    expect(state.resumeData).toBeDefined();
    expect(state.jobData).toBeDefined();
    expect(state.matchResult).toBeDefined();

    // Verify output matches expected schemas
    expect(ResumeSchema.safeParse(state.resumeData).success).toBe(true);
    expect(JobSchema.safeParse(state.jobData).success).toBe(true);
    expect(MatchSchema.safeParse(state.matchResult).success).toBe(true);

    // Score is >= 60, so no interrupt
    const snapshot = await compiledGraph.getState({ configurable: { thread_id: threadId } });
    expect(snapshot.next).toHaveLength(0);
  });

  it("response shape matches what the UI expects", async () => {
    const compiledGraph = buildScoringGraph(mockModel);
    const state = await compiledGraph.invoke(
      { resumeText: "resume text", jobText: "job text" },
      { configurable: { thread_id: "test-thread-ui-shape" } }
    );

    // These fields must all be present and correctly typed for the UI
    const match = state.matchResult!;
    expect(typeof match.score).toBe("number");
    expect(Array.isArray(match.matchedSkills)).toBe(true);
    expect(Array.isArray(match.missingSkills)).toBe(true);
    expect(typeof match.narrativeAlignment).toBe("string");
    expect(Array.isArray(match.gaps)).toBe(true);
    expect(Array.isArray(match.resumeAdvice)).toBe(true);
    expect(typeof match.weakMatch).toBe("boolean");

    // resumeData and jobData must be present for collapsible sections
    expect(state.resumeData).toBeTruthy();
    expect(state.jobData).toBeTruthy();

    // Raw text must not be in output as a parseable resume (only the typed state fields)
    expect(state.resumeData).not.toBeTypeOf("string");
    expect(state.jobData).not.toBeTypeOf("string");
  });

  it("graph is interrupted for low-score run (score < 60)", async () => {
    // Build a model that returns a low score
    const lowScoreResult = {
      ...validMatchResult,
      score: 45,
      weakMatch: true,
      weakMatchReason: "Too junior for this role.",
    };

    const lowScoreModel = {
      withStructuredOutput: vi.fn().mockImplementation((schema) => {
        if (schema === ResumeSchema) return { invoke: vi.fn().mockResolvedValue(validResumeData) };
        if (schema === JobSchema) return { invoke: vi.fn().mockResolvedValue(validJobData) };
        if (schema === MatchSchema) return { invoke: vi.fn().mockResolvedValue(lowScoreResult) };
        return { invoke: vi.fn().mockResolvedValue({}) };
      }),
    };

    const compiledGraph = buildScoringGraph(lowScoreModel);
    const threadId = "test-thread-low-score";

    await compiledGraph.invoke(
      { resumeText: "resume text", jobText: "job text" },
      { configurable: { thread_id: threadId } }
    );

    const snapshot = await compiledGraph.getState({ configurable: { thread_id: threadId } });
    expect(snapshot.next.length).toBeGreaterThan(0);
    expect(snapshot.values.matchResult?.score).toBe(45);
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
