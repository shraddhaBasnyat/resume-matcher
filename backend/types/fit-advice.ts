import { z } from "zod";

export const EvidenceItemSchema = z.object({
  label:      z.string().min(1),
  detail:     z.string().min(1),
  confidence: z.enum(["high", "medium"]),
});
export type EvidenceItem = z.infer<typeof EvidenceItemSchema>;

export const ReframingItemSchema = z.object({
  before: z.string().min(1),
  after:  z.string().min(1),
  reason: z.string().min(1),
});
export type ReframingItem = z.infer<typeof ReframingItemSchema>;

export const TaggedItemSchema = z.object({
  severity: z.enum(["material", "notable"]),
  text:     z.string().min(1),
});
export type TaggedItem = z.infer<typeof TaggedItemSchema>;
