import { deriveScenario, SCENARIO_VERDICT_MAP } from "./scenario/derive-scenario.js";
import type { GraphStateType } from "./scoring-graph-state.js";

export function routeVerdicts(state: GraphStateType) {
  if (state.fitScore === undefined) {
    throw new Error("routeVerdicts: fitScore is missing — analyzeFit node did not complete successfully");
  }

  const atsScore = state.atsScore ?? undefined;
  const { scenarioId } = deriveScenario(state.fitScore, atsScore);

  // Return a plain state update so the emitter can read fitScore, atsScore, scenarioId
  // from _outputs in handleChainEnd. Routing is handled via addConditionalEdges in
  // the graph using selectVerdictNode below.
  return { scenarioId, fitScore: state.fitScore, atsScore: state.atsScore ?? null };
}

// Conditional edge routing function — reads scenarioId written by routeVerdicts and
// returns the target verdict node name.
export function selectVerdictNode(state: GraphStateType): string {
  const scenarioId = state.scenarioId;
  if (!scenarioId) {
    throw new Error("selectVerdictNode: state.scenarioId is undefined — routeVerdicts did not write it to state");
  }
  return SCENARIO_VERDICT_MAP[scenarioId];
}
