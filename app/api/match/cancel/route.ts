import { NextRequest, NextResponse } from "next/server";
import { Client } from "langsmith";
import { isTracingEnabled } from "@/lib/langsmith";
import { activeRuns } from "@/lib/active-runs";
import { z } from "zod";

const CancelRequestSchema = z.object({
  threadId: z.string().min(1),
  rootRunId: z.string().optional(),
  runStartTime: z.number().optional(),
});

export async function POST(request: NextRequest) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = CancelRequestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid request body", details: parsed.error.flatten() },
      { status: 400 }
    );
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

  return NextResponse.json({ cancelled: true });
}
