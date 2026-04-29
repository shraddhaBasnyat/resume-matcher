import { Command } from "@langchain/langgraph";
import { deriveScenario } from "./scenario/derive-scenario.js";
import type { GraphStateType } from "./scoring-graph-state.js";

// Command-based routing node: calls deriveScenario (fitScore + atsScore only),
// writes scenarioId to state, and dispatches to the single verdict node.
export function routeVerdicts(state: GraphStateType) {
  if (state.fitScore === undefined) {
    throw new Error("routeVerdicts: fitScore is missing — analyzeFit node did not complete successfully");
  }

  // state.atsScore is the first-class field written by atsAnalysis node
  const atsScore = state.atsScore ?? undefined;
  const { scenarioId, verdictNode } = deriveScenario(state.fitScore, atsScore);

  return new Command({
    // Include fitScore and atsScore in update so NodeProgressEmitter can read them
    // from _outputs in handleChainEnd for the routeVerdicts node_done payload.
    // These are re-writes of existing state values — safe with replace reducers.
    update: { scenarioId, fitScore: state.fitScore, atsScore: state.atsScore ?? null },
    goto: [verdictNode],
  });
}
