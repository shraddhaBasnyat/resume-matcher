import { z } from "zod";

export const MatchRequestSchema = z.object({
  resumeText: z.string().min(1).max(100_000).optional(),
  jobText: z.string().min(1).max(100_000).optional(),
  humanContext: z.string().max(100_000).optional(),
  threadId: z.string().min(1).max(10_000).optional(),
});

export type MatchRequest = z.infer<typeof MatchRequestSchema>;

export function isResumeRun(data: MatchRequest): boolean {
  return !!(data.threadId && data.humanContext !== undefined);
}
