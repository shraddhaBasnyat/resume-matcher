import { ChatOllama } from "@langchain/ollama";
import { ChatAnthropic } from "@langchain/anthropic";
import { buildScoringGraph } from "../../lib/graph/scoring-graph.js";

const model =
  process.env.USE_CLOUD_LLM === "true"
    ? new ChatAnthropic({ model: "claude-haiku-4-5-20251001", apiKey: process.env.ANTHROPIC_API_KEY })
    : new ChatOllama({ model: "llama3.2" });

export const graph = buildScoringGraph(model);
