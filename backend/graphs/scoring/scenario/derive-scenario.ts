import type { ArchetypeContext } from "../../../archetypes/types";

const STRONG_FIT_THRESHOLD = 75;
const WEAK_FIT_THRESHOLD = 50;
const ATS_THRESHOLD = 75;

type ScenarioId = "1a" | "1b" | "2" | "3" | "4a" | "4b" | "5" | "6" | "7";
type VerdictNode =
  | "analyzeStrongMatch"
  | "analyzeNarrativeGap"
  | "analyzeArchetypeGap"
  | "analyzeSkepticalReconciliation"
  | null;

interface DeriveScenarioResult {
  scenarioId: ScenarioId;
  verdictNode: VerdictNode;
  runRoadmap: boolean;
  runATS: boolean;
}

function atsRequired(atsScore: number | undefined): boolean {
  return atsScore !== undefined && atsScore < ATS_THRESHOLD;
}

export function deriveScenario(
  fitScore: number,
  atsScore: number | undefined,
  intent: "confident_match" | "exploring_gap",
  archetypeContext: ArchetypeContext | null,
  userTier: "base" | "paid",
  hitlFired: boolean
): DeriveScenarioResult {
  // 1. HITL override
  if (hitlFired) {
    return {
      scenarioId: "4b",
      verdictNode: "analyzeSkepticalReconciliation",
      runRoadmap: true,
      runATS: atsRequired(atsScore),
    };
  }

  // 2. Strong fit + low ATS
  if (fitScore >= STRONG_FIT_THRESHOLD && atsScore !== undefined && atsScore < ATS_THRESHOLD) {
    return {
      scenarioId: "1b",
      verdictNode: "analyzeStrongMatch",
      runRoadmap: false,
      runATS: true,
    };
  }

  // 3. Strong fit (ATS ok or undefined)
  if (fitScore >= STRONG_FIT_THRESHOLD) {
    return {
      scenarioId: "1a",
      verdictNode: "analyzeStrongMatch",
      runRoadmap: false,
      runATS: false,
    };
  }

  // 4. Exploring gap, moderate fit
  if (intent === "exploring_gap" && fitScore >= WEAK_FIT_THRESHOLD) {
    return {
      scenarioId: "7",
      verdictNode: "analyzeNarrativeGap",
      runRoadmap: true,
      runATS: atsRequired(atsScore),
    };
  }

  // 5. Exploring gap, low fit
  if (intent === "exploring_gap" && fitScore < WEAK_FIT_THRESHOLD) {
    return {
      scenarioId: "6",
      verdictNode: null,
      runRoadmap: true,
      runATS: atsRequired(atsScore),
    };
  }

  // 6. Archetype gap (paid tier)
  if (fitScore >= WEAK_FIT_THRESHOLD && archetypeContext !== null && userTier === "paid") {
    return {
      scenarioId: "3",
      verdictNode: "analyzeArchetypeGap",
      runRoadmap: false,
      runATS: atsRequired(atsScore),
    };
  }

  // 7. Narrative gap
  if (fitScore >= WEAK_FIT_THRESHOLD) {
    return {
      scenarioId: "2",
      verdictNode: "analyzeNarrativeGap",
      runRoadmap: false,
      runATS: atsRequired(atsScore),
    };
  }

  // 8. Low fit confident_match (first-pass; node handles 4a vs 5 distinction)
  return {
    scenarioId: "4a",
    verdictNode: "analyzeSkepticalReconciliation",
    runRoadmap: false,
    runATS: atsRequired(atsScore),
  };
}
