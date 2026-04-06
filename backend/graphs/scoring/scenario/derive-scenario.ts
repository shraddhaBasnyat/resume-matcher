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

export function deriveScenario(
  fitScore: number,
  atsScore: number | undefined
): DeriveScenarioResult {
  // Strong fit — check ATS to distinguish confirmed vs invisible_expert
  if (fitScore >= STRONG_FIT_THRESHOLD) {
    if (atsScore !== undefined && atsScore < ATS_THRESHOLD) {
      return { scenarioId: "invisible_expert", verdictNode: "analyzeStrongMatch" };
    }
    return { scenarioId: "confirmed_fit", verdictNode: "analyzeStrongMatch" };
  }

  // Moderate fit
  if (fitScore >= WEAK_FIT_THRESHOLD) {
    return { scenarioId: "narrative_gap", verdictNode: "analyzeNarrativeGap" };
  }

  // Low fit
  return { scenarioId: "honest_verdict", verdictNode: "analyzeSkepticalReconciliation" };
}
