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

export type ScenarioId =
  | "confirmed_fit"
  | "invisible_expert"
  | "narrative_gap"
  | "honest_verdict";

export interface MatchResponse {
  scenarioId: ScenarioId;
  fitScore: number;
  battleCard: {
    headline: string;
    bulletPoints: string[];
  };
  fitAdvice: { key: string; bulletPoints: string[] }[];
  atsProfile: {
    atsScore: number | null;
    machineParsing: string[];
    machineRanking: string[];
  };
  scenarioSummary: { text: string };
  threadId: string;
  _meta: { durationMs: number };
}
