import { Router } from "express";
import { z } from "zod";
import { createSSEStream, handleClientDisconnect } from "../../infra/stream.js";
import { runMatchGraph } from "../../infra/runner.js";

const router = Router();

const RunRequestSchema = z.object({
  resumeText: z.string().min(1).max(100_000),
  jobText: z.string().min(1).max(100_000),
  humanContext: z.string().max(100_000).optional(),
});

router.post("/", (req, res) => {
  const parseResult = RunRequestSchema.safeParse(req.body);
  if (!parseResult.success) {
    res.status(400).json({ error: "Invalid request body", details: parseResult.error.flatten() });
    return;
  }

  const { resumeText, jobText, humanContext } = parseResult.data;
  const { emit, close } = createSSEStream(res);
  const abort = new AbortController();

  handleClientDisconnect(req, res, abort);
  runMatchGraph({ kind: "fresh", resumeText, jobText, humanContext, emit, close, abort });
});

export default router;
