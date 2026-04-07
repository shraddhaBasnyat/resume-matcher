import { Command } from "@langchain/langgraph";
import { deriveScenario } from "./scenario/derive-scenario.js";
import type { GraphStateType } from "./scoring-graph-state.js";

// Stub: sets archetypeContext = null until Pass 2 archetype detection is implemented.
export async function detectArchetype(_state: GraphStateType) {
  return { archetypeContext: null };
}

// Command-based routing node: calls deriveScenario (fitScore + atsScore only),
// writes scenarioId to state, and dispatches to the single verdict node.
export function routeVerdicts(state: GraphStateType) {
  if (!state.matchResult) {
    throw new Error("routeVerdicts: matchResult is missing — scoreMatch node did not complete successfully");
  }

  const atsScore = state.atsProfile?.atsScore ?? undefined;
  const { scenarioId, verdictNode } = deriveScenario(
    state.matchResult.fitScore,
    atsScore,
  );

  return new Command({
    update: { scenarioId },
    goto: [verdictNode],
  });
}
