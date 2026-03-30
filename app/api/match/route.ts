import { NextRequest } from "next/server";
import { MatchRequestSchema, isResumeRun } from "./_lib/request-schema";
import { createSSEStream } from "./_lib/stream";
import { runMatchGraph } from "./_lib/runner";

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

  const parseResult = MatchRequestSchema.safeParse(body);
  if (!parseResult.success) {
    return new Response(
      JSON.stringify({ error: "Invalid request body", details: parseResult.error.flatten() }),
      { status: 400, headers: { "Content-Type": "application/json" } }
    );
  }

  const { resumeText, jobText, humanContext, threadId } = parseResult.data;

  const resumeRun = isResumeRun(parseResult.data);
  if (!resumeRun && (!resumeText || !jobText)) {
    return new Response(
      JSON.stringify({ error: "resumeText and jobText are required for new runs" }),
      { status: 400, headers: { "Content-Type": "application/json" } }
    );
  }

  const { stream, emit, close } = createSSEStream();
  const abort = new AbortController();

  const graphOptions = resumeRun
    ? { kind: "resume" as const, humanContext, threadId, emit, close, abort }
    : { kind: "fresh" as const, resumeText: resumeText!, jobText: jobText!, humanContext, threadId, emit, close, abort };

  runMatchGraph(graphOptions);

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}
