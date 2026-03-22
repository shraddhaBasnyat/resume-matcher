import { z } from "zod";

export const JobSchema = z.object({
  title: z.string().describe("Job title"),
  company: z.string().optional().describe("Company name"),
  requiredSkills: z.array(z.string()).describe("Skills explicitly required for the role"),
  niceToHaveSkills: z.array(z.string()).describe("Skills listed as preferred or nice-to-have"),
  keywords: z.array(z.string()).describe("Important technical and domain keywords from the job description"),
  experienceYears: z.number().optional().describe("Minimum years of experience required"),
  seniorityLevel: z
    .enum(["junior", "mid", "senior", "lead", "manager"])
    .optional()
    .describe("Inferred seniority level of the role"),
});

export type JobDescription = z.infer<typeof JobSchema>;
