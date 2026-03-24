import { ChatOllama } from "@langchain/ollama";
import { buildScoringGraph } from "@/lib/graph/scoring-graph";

// TODO Day 4: move inside request handler to support
// per-request user API keys (ChatAnthropic/ChatOpenAI)
const model = new ChatOllama({ model: "llama3.2" });
export const graph = buildScoringGraph(model);
