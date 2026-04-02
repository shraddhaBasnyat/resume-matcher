import { Router } from "express";
import { z } from "zod";
import { createSSEStream, handleClientDisconnect } from "../../_lib/stream.js";
import { runMatchGraph } from "../../_lib/runner.js";

const router = Router();

const AcceptRequestSchema = z.object({
  threadId: z.string().min(1).max(256),
});

router.post("/", (req, res) => {
  const parsed = AcceptRequestSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid request body", details: parsed.error.flatten() });
    return;
  }

  const { threadId } = parsed.data;
  const { emit, close } = createSSEStream(res);
  const abort = new AbortController();

  handleClientDisconnect(req, res, abort);
  runMatchGraph({ kind: "accept", threadId, emit, close, abort });
});

export default router;
