import { Router } from "express";
import { z } from "zod";
import { createSSEStream, handleClientDisconnect } from "../../infra/stream.js";
import { runMatchGraph } from "../../infra/runner.js";

const router = Router();

// ---------------------------------------------------------------------------
// Intent context schemas — validated per-intent so the discriminated union
// enforces the correct context shape without cross-field superRefine.
// ---------------------------------------------------------------------------

const ConfidentMatchContextSchema = z.object({
  basis: z
    .array(
      z.enum([
        "direct_experience",
        "adjacent_role",
        "side_projects",
        "self_taught",
        "career_pivot",
      ])
    )
    .min(1, "At least one basis selection is required"),
});

const ExploringGapContextSchema = z.object({
  timeline: z.enum(["applying_now", "three_to_six_months", "one_year_plus"]),
  currentStatus: z
    .array(
      z.enum([
        "side_projects",
        "self_taught",
        "transferable_skills",
        "starting_from_scratch",
        "already_retraining",
      ])
    )
    .min(1, "At least one currentStatus selection is required"),
});

// Discriminated union on intent — ensures intentContext matches the intent value.
const RunRequestSchema = z.discriminatedUnion("intent", [
  z.object({
    resumeText: z.string().min(1).max(100_000),
    jobText: z.string().min(1).max(100_000),
    intent: z.literal("confident_match"),
    intentContext: ConfidentMatchContextSchema,
  }),
  z.object({
    resumeText: z.string().min(1).max(100_000),
    jobText: z.string().min(1).max(100_000),
    intent: z.literal("exploring_gap"),
    intentContext: ExploringGapContextSchema,
  }),
]);

router.post("/", (req, res) => {
  const parseResult = RunRequestSchema.safeParse(req.body);
  if (!parseResult.success) {
    res.status(400).json({ error: "Invalid request body", details: parseResult.error.flatten() });
    return;
  }

  const { resumeText, jobText, intent, intentContext } = parseResult.data;
  const { emit, close } = createSSEStream(res);
  const abort = new AbortController();

  handleClientDisconnect(req, res, abort);
  runMatchGraph({ kind: "fresh", resumeText, jobText, intent, intentContext, emit, close, abort });
});

export default router;
