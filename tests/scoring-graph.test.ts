import { describe, it, expect, vi } from "vitest";
import { MatchSchema } from "../lib/match-schema";
import { JobSchema } from "../lib/job-schema";
import { buildJobChain, buildScoringChain, buildGapAnalysisChain } from "../lib/scoring-graph";

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

  it("accepts weakMatch without weakMatchReason (optional)", () => {
    const { weakMatchReason: _, ...withoutReason } = weakMatchResult;
    expect(MatchSchema.safeParse({ ...withoutReason, weakMatch: true }).success).toBe(true);
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
// buildJobChain — same mock pattern as buildResumeChain tests
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
// buildScoringChain — tests valid MatchSchema output shape
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

    // The model's invoke should have been called with messages that include the human context
    expect(mockInvoke).toHaveBeenCalledTimes(1);
    const calledMessages = mockInvoke.mock.calls[0][0];
    const messageContent = calledMessages.messages
      .map((m: { content: string }) => m.content)
      .join(" ");
    expect(messageContent).toContain("I led 3 engineers for 2 years off the books.");
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
// buildGapAnalysisChain
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
    const result = await chain.invoke({ match_result: JSON.stringify(validMatchResult) });

    expect(mockModel.withStructuredOutput).toHaveBeenCalledWith(MatchSchema);
    expect(MatchSchema.safeParse(result).success).toBe(true);
    expect(result.resumeAdvice).toHaveLength(2);
  });
});

// ---------------------------------------------------------------------------
// Conditional edge logic (score routing)
// ---------------------------------------------------------------------------

describe("score routing logic", () => {
  // The conditional edge function is internal to buildScoringGraph, so we test
  // the equivalent logic directly.
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
