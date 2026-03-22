import { NextRequest, NextResponse } from "next/server";
import { ChatOllama } from "@langchain/ollama";
import { Command } from "@langchain/langgraph";
import { buildScoringGraph } from "@/lib/scoring-graph";

const model = new ChatOllama({ model: "llama3.2" });
const graph = buildScoringGraph(model);

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { resumeText, jobText, humanContext, threadId } = body as {
      resumeText?: string;
      jobText?: string;
      humanContext?: string;
      threadId?: string;
    };

    const config = {
      configurable: { thread_id: threadId ?? crypto.randomUUID() },
    };

    let state;

    if (threadId && humanContext !== undefined) {
      // Resume from interrupt — human provided context (or accepted by passing empty string)
      state = await graph.invoke(new Command({ resume: humanContext }), config);
    } else {
      if (!resumeText || !jobText) {
        return NextResponse.json(
          { error: "resumeText and jobText are required" },
          { status: 400 }
        );
      }
      state = await graph.invoke(
        { resumeText, jobText, humanContext: "" },
        config
      );
    }

    // Check if the graph is paused at an interrupt
    const snapshot = await graph.getState(config);
    const isInterrupted = snapshot.next.length > 0;

    if (isInterrupted) {
      return NextResponse.json(
        {
          status: "interrupted",
          threadId: config.configurable.thread_id,
          partialResult: state.matchResult ?? null,
          message:
            "Score is below 60. Provide additional context about your experience to re-score.",
        },
        { status: 202 }
      );
    }

    return NextResponse.json({
      status: "complete",
      threadId: config.configurable.thread_id,
      matchResult: state.matchResult,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);

    if (
      message.includes("ECONNREFUSED") ||
      message.includes("fetch failed") ||
      message.includes("connect ECONNREFUSED")
    ) {
      return NextResponse.json(
        {
          error: "Ollama is unreachable",
          message:
            "Could not connect to Ollama. Make sure Ollama is running locally (`ollama serve`) and the llama3.2 model is pulled.",
        },
        { status: 503 }
      );
    }

    return NextResponse.json({ error: "Failed to score match", message }, { status: 500 });
  }
}
