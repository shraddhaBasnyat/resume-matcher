import { describe, it, expect, vi } from "vitest";
import { ResumeSchema } from "../lib/schemas";
import { buildResumeChain } from "../lib/resume-chain";

// --- Schema validation tests ---

describe("ResumeSchema", () => {
  const validResume = {
    name: "Jane Doe",
    email: "jane@example.com",
    phone: "+1-555-000-1234",
    skills: ["TypeScript", "React", "Node.js"],
    experience: [
      { company: "Acme Corp", role: "Software Engineer", years: 3 },
      { company: "Startup Inc", role: "Frontend Developer", years: 1.5 },
    ],
    education: [
      { degree: "B.Sc. Computer Science", institution: "State University" },
    ],
    careerNarrative: {},
  };

  it("accepts a valid resume object", () => {
    const result = ResumeSchema.safeParse(validResume);
    expect(result.success).toBe(true);
  });

  it("accepts optional fields when provided", () => {
    const result = ResumeSchema.safeParse({
      ...validResume,
      summary: "Experienced engineer with 5 years in web development.",
      location: "San Francisco, CA",
      totalYearsExperience: 4.5,
      keywords: ["microservices", "agile", "REST APIs"],
    });
    expect(result.success).toBe(true);
  });

  it("accepts valid resume without other optional fields", () => {
    const result = ResumeSchema.safeParse(validResume);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.summary).toBeUndefined();
      expect(result.data.location).toBeUndefined();
      expect(result.data.totalYearsExperience).toBeUndefined();
      expect(result.data.keywords).toBeUndefined();
    }
  });

  it("rejects an invalid email", () => {
    const result = ResumeSchema.safeParse({ ...validResume, email: "not-an-email" });
    expect(result.success).toBe(false);
  });

  it("rejects missing required fields", () => {
    const { name: _name, ...withoutName } = validResume;
    const result = ResumeSchema.safeParse(withoutName);
    expect(result.success).toBe(false);
  });

  it("rejects non-array skills", () => {
    const result = ResumeSchema.safeParse({ ...validResume, skills: "TypeScript" });
    expect(result.success).toBe(false);
  });

  it("rejects experience entry missing company", () => {
    const result = ResumeSchema.safeParse({
      ...validResume,
      experience: [{ role: "Engineer", years: 2 }],
    });
    expect(result.success).toBe(false);
  });

  it("accepts empty arrays for skills, experience, and education", () => {
    const result = ResumeSchema.safeParse({
      ...validResume,
      skills: [],
      experience: [],
      education: [],
    });
    expect(result.success).toBe(true);
  });

  it("rejects non-number totalYearsExperience", () => {
    const result = ResumeSchema.safeParse({
      ...validResume,
      totalYearsExperience: "five",
    });
    expect(result.success).toBe(false);
  });

  it("rejects non-array keywords", () => {
    const result = ResumeSchema.safeParse({
      ...validResume,
      keywords: "agile",
    });
    expect(result.success).toBe(false);
  });

  it("accepts a valid careerNarrative when provided", () => {
    const result = ResumeSchema.safeParse({
      ...validResume,
      careerNarrative: {
        trajectory: "IC engineer to tech lead",
        dominantTheme: "Systems reliability and scale",
        inferredStrengths: ["debugging under pressure", "cross-team communication"],
        careerMotivation: "Moving toward distributed systems architecture",
        resumeStoryGaps: ["2-year gap between 2019 and 2021 unexplained"],
      },
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.careerNarrative.trajectory).toBe("IC engineer to tech lead");
      expect(result.data.careerNarrative.inferredStrengths).toHaveLength(2);
      expect(result.data.careerNarrative.resumeStoryGaps).toHaveLength(1);
    }
  });

  it("accepts careerNarrative with empty object — subfield defaults applied", () => {
    const result = ResumeSchema.safeParse({ ...validResume, careerNarrative: {} });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.careerNarrative.trajectory).toBe("");
      expect(result.data.careerNarrative.dominantTheme).toBe("");
      expect(result.data.careerNarrative.inferredStrengths).toEqual([]);
      expect(result.data.careerNarrative.careerMotivation).toBe("");
      expect(result.data.careerNarrative.resumeStoryGaps).toEqual([]);
    }
  });

  it("accepts careerNarrative with only some sub-fields — missing ones use defaults", () => {
    const result = ResumeSchema.safeParse({
      ...validResume,
      careerNarrative: { trajectory: "IC to lead" },
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.careerNarrative.trajectory).toBe("IC to lead");
      expect(result.data.careerNarrative.dominantTheme).toBe("");
    }
  });

  it("rejects careerNarrative with non-array inferredStrengths", () => {
    const result = ResumeSchema.safeParse({
      ...validResume,
      careerNarrative: {
        trajectory: "IC to lead",
        dominantTheme: "Scale",
        inferredStrengths: "debugging",
        careerMotivation: "Architecture",
        resumeStoryGaps: [],
      },
    });
    expect(result.success).toBe(false);
  });
});

// --- Chain factory tests ---

describe("buildResumeChain", () => {
  it("calls the model with the resume text and returns parsed data", async () => {
    const expectedOutput = {
      name: "John Smith",
      email: "john@example.com",
      phone: "555-1234",
      summary: "Seasoned backend engineer.",
      location: "New York, NY",
      skills: ["Python", "Django", "PostgreSQL"],
      experience: [{ company: "Big Co", role: "Dev", years: 2 }],
      education: [{ degree: "B.Sc.", institution: "MIT" }],
      totalYearsExperience: 2,
      keywords: ["REST APIs", "agile"],
      careerNarrative: {
        trajectory: "Junior to senior backend engineer",
        dominantTheme: "Data-intensive systems",
        inferredStrengths: ["API design", "database optimization"],
        careerMotivation: "Building reliable backend infrastructure",
        resumeStoryGaps: [],
      },
    };

    const mockInvoke = vi.fn().mockResolvedValue(expectedOutput);
    const mockModel = {
      withStructuredOutput: vi.fn().mockReturnValue({ invoke: mockInvoke }),
    };

    const chain = buildResumeChain(mockModel);
    const result = await chain.invoke({ resume_text: "John Smith resume text..." });

    expect(mockModel.withStructuredOutput).toHaveBeenCalledWith(ResumeSchema);
    expect(result).toEqual(expectedOutput);
  });

  it("propagates errors from the model", async () => {
    const mockModel = {
      withStructuredOutput: vi.fn().mockReturnValue({
        invoke: vi.fn().mockRejectedValue(new Error("Model error")),
      }),
    };

    const chain = buildResumeChain(mockModel);
    await expect(chain.invoke({ resume_text: "..." })).rejects.toThrow("Model error");
  });
});
