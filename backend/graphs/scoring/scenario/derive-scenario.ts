export const STRONG_FIT_THRESHOLD = 75;
export const WEAK_FIT_THRESHOLD = 50;
export const ATS_THRESHOLD = 75;

export type ScenarioId = "confirmed_fit" | "invisible_expert" | "narrative_gap" | "honest_verdict";
export type VerdictNode =
  | "analyzeStrongMatch"
  | "analyzeNarrativeGap"
  | "analyzeSkepticalReconciliation";

export interface DeriveScenarioResult {
  scenarioId: ScenarioId;
  verdictNode: VerdictNode;
}

export const SCENARIO_VERDICT_MAP: Record<ScenarioId, VerdictNode> = {
  confirmed_fit: "analyzeStrongMatch",
  invisible_expert: "analyzeStrongMatch",
  narrative_gap: "analyzeNarrativeGap",
  honest_verdict: "analyzeSkepticalReconciliation",
};

export function deriveScenario(
  fitScore: number,
  atsScore: number | undefined
): DeriveScenarioResult {
  let scenarioId: ScenarioId;

  // Strong fit — check ATS to distinguish confirmed vs invisible_expert
  if (fitScore >= STRONG_FIT_THRESHOLD) {
    scenarioId = atsScore !== undefined && atsScore < ATS_THRESHOLD
      ? "invisible_expert"
      : "confirmed_fit";
  } else if (fitScore >= WEAK_FIT_THRESHOLD) {
    // Moderate fit
    scenarioId = "narrative_gap";
  } else {
    // Low fit
    scenarioId = "honest_verdict";
  }

  return { scenarioId, verdictNode: SCENARIO_VERDICT_MAP[scenarioId] };
}
