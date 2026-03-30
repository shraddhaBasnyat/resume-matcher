import { NextRequest } from "next/server";
import { ResumeRequestSchema } from "./resume-schema";
import { createSSEStream } from "../_lib/stream";
import { runMatchGraph } from "../_lib/runner";

export async function POST(request: NextRequest) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return new Response(
      JSON.stringify({ error: "Invalid JSON body" }),
      { status: 400, headers: { "Content-Type": "application/json" } }
    );
  }

  const parseResult = ResumeRequestSchema.safeParse(body);
  if (!parseResult.success) {
    return new Response(
      JSON.stringify({ error: "Invalid request body", details: parseResult.error.flatten() }),
      { status: 400, headers: { "Content-Type": "application/json" } }
    );
  }

  const { threadId, humanContext } = parseResult.data;
  const { stream, emit, close } = createSSEStream();
  const abort = new AbortController();

  runMatchGraph({ kind: "resume", threadId, humanContext, emit, close, abort });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}
