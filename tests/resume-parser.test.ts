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
  };

  it("accepts a valid resume object", () => {
    const result = ResumeSchema.safeParse(validResume);
    expect(result.success).toBe(true);
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
});

// --- Chain factory tests ---

describe("buildResumeChain", () => {
  it("calls the model with the resume text and returns parsed data", async () => {
    const expectedOutput = {
      name: "John Smith",
      email: "john@example.com",
      phone: "555-1234",
      skills: ["Python"],
      experience: [{ company: "Big Co", role: "Dev", years: 2 }],
      education: [{ degree: "B.Sc.", institution: "MIT" }],
    };

    // Mock model: withStructuredOutput returns an object with invoke
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
