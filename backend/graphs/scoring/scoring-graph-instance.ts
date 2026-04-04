import { ChatOllama } from "@langchain/ollama";
import { ChatAnthropic } from "@langchain/anthropic";
import { buildScoringGraph } from "./scoring-graph.js";

const useCloudLLM = process.env.USE_CLOUD_LLM === "true";

if (useCloudLLM && !process.env.ANTHROPIC_API_KEY) {
  throw new Error(
    "USE_CLOUD_LLM is set to 'true' but ANTHROPIC_API_KEY is not defined. " +
      "Set ANTHROPIC_API_KEY in your environment to use the cloud LLM."
  );
}

const model =
  useCloudLLM
    ? new ChatAnthropic({
        model: "claude-haiku-4-5-20251001",
        apiKey: process.env.ANTHROPIC_API_KEY!,
      })
    : new ChatOllama({ model: "llama3.2" });

export const graph = buildScoringGraph(model);
