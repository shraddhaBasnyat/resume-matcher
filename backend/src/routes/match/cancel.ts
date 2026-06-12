import { Router } from "express";
import { z } from "zod";
import { activeRuns } from "../../../active-runs.js";
import { getCheckpointer } from "../../../graphs/scoring/scoring-graph.js";

const router = Router();

const CancelRequestSchema = z.object({
  threadId: z.string().min(1),
});

router.post("/", async (req, res) => {
  const parsed = CancelRequestSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid request body", details: parsed.error.flatten() });
    return;
  }

  const { threadId } = parsed.data;

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
