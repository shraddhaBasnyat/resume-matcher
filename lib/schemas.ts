import { z } from "zod";

export const ResumeSchema = z.object({
  name: z.string().describe("Full name of the candidate"),
  email: z.string().email().describe("Email address of the candidate"),
  phone: z.string().describe("Phone number of the candidate"),
  summary: z.string().optional().describe("Professional summary or objective statement"),
  location: z.string().optional().describe("City, state, or country of the candidate"),
  skills: z
    .array(z.string())
    .describe(
      "Individual skills as atomic items — e.g. 'React', 'Python', 'Docker'. Do NOT group them into categories like 'Frontend: React, Vue'."
    ),
  experience: z
    .array(
      z.object({
        company: z.string().describe("Company name"),
        role: z.string().describe("Job title or role"),
        years: z.number().describe("Number of years in this role"),
      })
    )
    .describe("Work experience entries"),
  education: z
    .array(
      z.object({
        degree: z.string().describe("Degree or certification obtained"),
        institution: z.string().describe("Name of the institution"),
      })
    )
    .describe("Education entries"),
  totalYearsExperience: z
    .number()
    .optional()
    .describe("Total years of professional experience, calculated by summing the experience array"),
  keywords: z
    .array(z.string())
    .optional()
    .describe(
      "Important technical and domain-specific terms from the resume useful for job matching (e.g. 'microservices', 'agile', 'NLP')"
    ),
});

export type Resume = z.infer<typeof ResumeSchema>;
