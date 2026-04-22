import { Command } from "@langchain/langgraph";
import { deriveScenario } from "./scenario/derive-scenario.js";
import type { GraphStateType } from "./scoring-graph-state.js";

// Command-based routing node: calls deriveScenario (fitScore + atsScore only),
// writes scenarioId to state, and dispatches to the single verdict node.
export function routeVerdicts(state: GraphStateType) {
  if (state.fitScore === undefined) {
    throw new Error("routeVerdicts: fitScore is missing — analyzeFit node did not complete successfully");
  }

  const atsScore = state.atsProfile?.atsScore ?? undefined;
  const { scenarioId, verdictNode } = deriveScenario(state.fitScore, atsScore);

  return new Command({
    update: { scenarioId },
    goto: [verdictNode],
  });
}
