import { Router } from "express";
import { z } from "zod";
import { Client } from "langsmith";
import { isTracingEnabled } from "../../../langsmith.js";
import { activeRuns } from "../../../active-runs.js";
import { getCheckpointer } from "../../../graphs/scoring/scoring-graph.js";

const router = Router();

const CancelRequestSchema = z.object({
  threadId: z.string().min(1),
  rootRunId: z.string().optional(),
  runStartTime: z.number().optional(),
});

router.post("/", async (req, res) => {
  const parsed = CancelRequestSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid request body", details: parsed.error.flatten() });
    return;
  }

  const { threadId, rootRunId, runStartTime } = parsed.data;

  // Update the LangSmith trace to reflect user-initiated cancellation
  if (isTracingEnabled() && rootRunId) {
    try {
      const client = new Client();
      await client.updateRun(rootRunId, {
        end_time: Date.now(),
        extra: {
          cancelled: true,
          cancelledBy: "human",
          cancelReason: "user_initiated_escape",
          durationMs: runStartTime != null ? Date.now() - runStartTime : undefined,
        },
        tags: ["cancelled", "human-interrupted"],
      });
    } catch (e) {
      // LangSmith update failure must not block the cancellation response
      console.error("Failed to update LangSmith trace on cancel:", e);
    }
  }

  // Abort the in-flight graph run for this thread
  const run = activeRuns.get(threadId);
  if (run) {
    run.abort();
    activeRuns.delete(threadId);
  }
  // always clean up checkpoint, covers both active runs and interrupted HITL threads
  await getCheckpointer().deleteThread(threadId);

  res.json({ cancelled: true });
});

export default router;
