import { z } from "zod";
import type { Resume } from "@resume-matcher/shared/types/resume.js";

export const ResumeSchema: z.ZodType<Resume, z.ZodTypeDef, unknown> = z.object({
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
  careerNarrative: z
    .object({
      trajectory: z.string().default("").describe("The arc of the candidate's career progression"),
      dominantTheme: z.string().default("").describe("The recurring theme or throughline across roles"),
      inferredStrengths: z.array(z.string()).default([]).describe("Strengths inferred from the pattern of roles and accomplishments"),
      careerMotivation: z.string().default("").describe("What the candidate appears to move toward based on their choices"),
      resumeStoryGaps: z.array(z.string()).default([]).describe("Gaps, contradictions, or unexplained transitions in the career story"),
    })
    .describe("Inferred career narrative — read between the lines, do not summarize"),
}) as z.ZodType<Resume, z.ZodTypeDef, unknown>;

export type { Resume };
