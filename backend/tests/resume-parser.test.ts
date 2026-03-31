import { describe, it, expect, vi, beforeEach } from "vitest";
import { ResumeSchema } from "../lib/schemas/resume-schema.js";
import { buildResumeChain } from "../lib/chains/resume-chain.js";

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

// --- Validation failure handling tests ---

describe("buildResumeChain — validation failure handling", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.restoreAllMocks();
  });

  it("calls logValidationFailure with nodeName 'parse-resume' when model returns invalid shape", async () => {
    // Model returns data missing a required field (careerNarrative)
    const invalidOutput = {
      name: "Jane Doe",
      email: "jane@example.com",
      phone: "555-1234",
      skills: ["TypeScript"],
      experience: [],
      education: [],
      // careerNarrative is missing — required field
    };

    const mockInvoke = vi.fn().mockResolvedValue(invalidOutput);
    const mockModel = {
      withStructuredOutput: vi.fn().mockReturnValue({ invoke: mockInvoke }),
    };

    const logValidationFailureMock = vi.fn().mockResolvedValue(undefined);
    vi.doMock("../lib/langsmith.js", () => ({
      isTracingEnabled: vi.fn().mockReturnValue(false),
      RootRunCapture: class {
        name = "root_run_capture";
        constructor() {}
        handleChainStart() {}
      },
      logValidationFailure: logValidationFailureMock,
    }));

    const { buildResumeChain: buildResumeChainMocked } = await import("../lib/chains/resume-chain.js");
    const chain = buildResumeChainMocked(mockModel);

    // parse() will throw because careerNarrative is required with no default
    await expect(chain.invoke({ resume_text: "Jane resume..." })).rejects.toThrow();

    expect(logValidationFailureMock).toHaveBeenCalledWith(
      expect.objectContaining({
        nodeName: "parse-resume",
        rawOutput: invalidOutput,
      })
    );
  });

  it("returns validated data with careerNarrative defaults when model omits subfields", async () => {
    // Model returns careerNarrative with only some subfields — missing ones get defaults
    const partialOutput = {
      name: "Jane Doe",
      email: "jane@example.com",
      phone: "555-1234",
      skills: ["TypeScript"],
      experience: [],
      education: [],
      careerNarrative: { trajectory: "IC to lead" },
      // dominantTheme, inferredStrengths, careerMotivation, resumeStoryGaps omitted
    };

    const mockInvoke = vi.fn().mockResolvedValue(partialOutput);
    const mockModel = {
      withStructuredOutput: vi.fn().mockReturnValue({ invoke: mockInvoke }),
    };

    const chain = buildResumeChain(mockModel);
    const result = await chain.invoke({ resume_text: "Jane resume..." });

    // safeParse succeeds — subfield defaults are applied
    expect(result.careerNarrative.trajectory).toBe("IC to lead");
    expect(result.careerNarrative.dominantTheme).toBe("");
    expect(result.careerNarrative.inferredStrengths).toEqual([]);
    expect(result.careerNarrative.careerMotivation).toBe("");
    expect(result.careerNarrative.resumeStoryGaps).toEqual([]);
  });

  it("does not call logValidationFailure when model returns a valid shape", async () => {
    const validOutput = {
      name: "Jane Doe",
      email: "jane@example.com",
      phone: "555-1234",
      skills: ["TypeScript"],
      experience: [],
      education: [],
      careerNarrative: {},
    };

    const mockInvoke = vi.fn().mockResolvedValue(validOutput);
    const mockModel = {
      withStructuredOutput: vi.fn().mockReturnValue({ invoke: mockInvoke }),
    };

    const logValidationFailureMock = vi.fn().mockResolvedValue(undefined);
    vi.doMock("../lib/langsmith.js", () => ({
      isTracingEnabled: vi.fn().mockReturnValue(false),
      RootRunCapture: class {
        name = "root_run_capture";
        constructor() {}
        handleChainStart() {}
      },
      logValidationFailure: logValidationFailureMock,
    }));

    const { buildResumeChain: buildResumeChainMocked } = await import("../lib/chains/resume-chain.js");
    const chain = buildResumeChainMocked(mockModel);
    await chain.invoke({ resume_text: "Jane resume..." });

    expect(logValidationFailureMock).not.toHaveBeenCalled();
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
