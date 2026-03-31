import { Router } from "express";
import { z } from "zod";
import { createSSEStream, handleClientDisconnect } from "../../_lib/stream.js";
import { runMatchGraph } from "../../_lib/runner.js";

const router = Router();

const ResumeRequestSchema = z.object({
  threadId: z.string().min(1).max(10_000),
  humanContext: z.string().max(100_000),
});

router.post("/", (req, res) => {
  const parseResult = ResumeRequestSchema.safeParse(req.body);
  if (!parseResult.success) {
    res.status(400).json({ error: "Invalid request body", details: parseResult.error.flatten() });
    return;
  }

  const { threadId, humanContext } = parseResult.data;
  const { emit, close } = createSSEStream(res);
  const abort = new AbortController();

  handleClientDisconnect(req, res, abort);
  runMatchGraph({ kind: "resume", threadId, humanContext, emit, close, abort });
});

export default router;
