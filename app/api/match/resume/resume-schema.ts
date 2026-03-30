import { z } from "zod";

export const ResumeRequestSchema = z.object({
  threadId: z.string().min(1).max(10_000),
  humanContext: z.string().max(100_000),
});

export type ResumeRequest = z.infer<typeof ResumeRequestSchema>;
