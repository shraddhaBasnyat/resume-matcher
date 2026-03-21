import { z } from "zod";

export const ResumeSchema = z.object({
  name: z.string().describe("Full name of the candidate"),
  email: z.string().email().describe("Email address of the candidate"),
  phone: z.string().describe("Phone number of the candidate"),
  skills: z.array(z.string()).describe("List of technical and soft skills"),
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
});

export type Resume = z.infer<typeof ResumeSchema>;
