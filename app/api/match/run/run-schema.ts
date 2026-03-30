import { z } from "zod";

export const RunRequestSchema = z.object({
  resumeText: z.string().min(1).max(100_000),
  jobText: z.string().min(1).max(100_000),
  humanContext: z.string().max(100_000).optional(),
});

export type RunRequest = z.infer<typeof RunRequestSchema>;
