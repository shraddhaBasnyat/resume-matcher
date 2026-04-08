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
// Core domain types
// ---------------------------------------------------------------------------

export interface MatchResult {
  fitScore: number;
  atsScore?: number;
  matchedSkills: string[];
  missingSkills: string[];
  narrativeAlignment: string;
  gaps: string[];
  resumeAdvice: string[];
  contextPrompt: string | null;
  weakMatch: boolean;
  weakMatchReason?: string;
}

export interface CareerNarrative {
  trajectory: string;
  dominantTheme: string;
  inferredStrengths: string[];
  careerMotivation: string;
  resumeStoryGaps: string[];
}

export interface Resume {
  name: string;
  email: string;
  phone: string;
  summary?: string;
  location?: string;
  skills: string[];
  experience: { company: string; role: string; years: number }[];
  education: { degree: string; institution: string }[];
  totalYearsExperience?: number;
  keywords?: string[];
  careerNarrative: CareerNarrative;
  sourceRole: string;
}

export interface Job {
  title: string;
  company?: string;
  requiredSkills: string[];
  niceToHaveSkills: string[];
  keywords: string[];
  experienceYears?: number;
  seniorityLevel?: "junior" | "mid" | "senior" | "lead" | "manager";
  targetRole: string;
}

// ---------------------------------------------------------------------------
// API request / response types
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
// Verdict node outputs — discriminated union by scenarioId
// ---------------------------------------------------------------------------

export interface ConfirmedFitAdvice {
  scenarioId: "confirmed_fit";
  confirmation: string;
  standoutStrengths: string[];
  minorGaps: string[];
}

export interface InvisibleExpertAdvice {
  scenarioId: "invisible_expert";
  confirmation: string;
  standoutStrengths: string[];
  minorGaps: string[];
  atsRealityCheck: string;
  terminologySwaps: string[];
  keywordsToAdd: string[];
  layoutAdvice: string[];
}

export interface NarrativeGapAdvice {
  scenarioId: "narrative_gap";
  narrativeBridge: string;
  reframingSuggestions: string[];
  transferableStrengths: string[];
  missingSkills: string[];
}

export interface HonestVerdictAdvice {
  scenarioId: "honest_verdict";
  hitlFired: boolean;
  honestAssessment: string;
  closingSteps: string[];
  acknowledgement: string | null;
}

export type FitAdvice =
  | ConfirmedFitAdvice
  | InvisibleExpertAdvice
  | NarrativeGapAdvice
  | HonestVerdictAdvice;

export interface MatchResponse {
  fitScore: number;
  matchedSkills: string[];
  missingSkills: string[];
  narrativeAlignment: string;
  weakMatch: boolean;
  weakMatchReason?: string;
  atsProfile: {
    atsScore: number | null;
    missingKeywords: string[];
    layoutFlags: string[]; // LayoutFlag values from backend — string[] is intentional, frontend renders but does not switch on these values
    terminologyGaps: string[];
  };
  fitAdvice: FitAdvice | null;
  scenarioId: "confirmed_fit" | "invisible_expert" | "narrative_gap" | "honest_verdict";
  threadId: string;
  _meta: { traceUrl: string | null; durationMs: number };
}
