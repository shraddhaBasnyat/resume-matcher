// ---------------------------------------------------------------------------
// Career transition intent — structured context collected before first run
// ---------------------------------------------------------------------------

export interface ConfidentMatchContext {
  basis: Array<
    | "direct_experience"
    | "adjacent_role"
    | "side_projects"
    | "self_taught"
    | "career_pivot"
  >;
}

export interface ExploringGapContext {
  timeline: "applying_now" | "three_to_six_months" | "one_year_plus";
  currentStatus: Array<
    | "side_projects"
    | "self_taught"
    | "transferable_skills"
    | "starting_from_scratch"
    | "already_retraining"
  >;
}

// ---------------------------------------------------------------------------
// API request types
// ---------------------------------------------------------------------------

export interface RunMatchRequest {
  resumeText: string;
  jobText: string;
  intent: "confident_match" | "exploring_gap";
  intentContext: ConfidentMatchContext | ExploringGapContext;
  humanContext?: string; // HITL only — absent on first run
}

export interface ResumeMatchRequest {
  threadId: string;
  humanContext: string;
}

export interface CancelMatchRequest {
  threadId: string;
  rootRunId?: string;
  runStartTime?: number;
}

// ---------------------------------------------------------------------------
// Public response types — mirrors PublicMatchResponseSchema on the backend
// ---------------------------------------------------------------------------

export type EvidenceItem  = { label: string; detail: string; confidence: "high" | "medium" };
export type ReframingItem = { before: string; after: string; reason: string };
export type TaggedItem    = { severity: "material" | "notable"; text: string };

export type ScenarioId =
  | "confirmed_fit"
  | "invisible_expert"
  | "narrative_gap"
  | "honest_verdict";

export type BattleCardVerdict = "hard_gap" | "framing_gap" | "terminology_gap" | "strong_match";

export interface BattleCardBullet {
  requirement: string;
  evidence: string;
  verdict: BattleCardVerdict;
}

export interface MatchResponse {
  scenarioId: ScenarioId;
  fitScore: number;
  battleCard: {
    headline: string;
    bullets: BattleCardBullet[];
  };
  fitAdvice: Array<{
    key: string;
    items: EvidenceItem[] | ReframingItem[] | TaggedItem[];
  }>;
  atsProfile: {
    atsScore: number | null;
    machineParsing: string[];
    machineRanking: string[];
  };
  scenarioSummary: { text: string };
  threadId: string;
  _meta: { durationMs: number };
}
