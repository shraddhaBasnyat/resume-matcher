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
}

// ---------------------------------------------------------------------------
// Public response types — mirrors PublicMatchResponseSchema on the backend
// ---------------------------------------------------------------------------

export type EvidenceItem  = { label: string; detail: string; confidence: "high" | "medium" };
export type ReframingItem = { before: string; after: string; reason: string };
export type TaggedItem    = { severity: "material" | "notable"; text: string };

export type FitAdviceEntry =
  | { key: "reframing_suggestions";  items: ReframingItem[] }
  | { key: "missing_skills";         items: TaggedItem[]    }
  | { key: "lead_with_these";        items: EvidenceItem[]  }
  | { key: "expect_these_questions"; items: EvidenceItem[]  }
  | { key: "watch_out_for";          items: EvidenceItem[]  }
  | { key: "standout_strengths";     items: EvidenceItem[]  }
  | { key: "ats_reality_check";      items: EvidenceItem[]  }
  | { key: "terminology_swaps";      items: ReframingItem[] }
  | { key: "keywords_to_add";        items: TaggedItem[]    }
  | { key: "honest_assessment";      items: EvidenceItem[]  }
  | { key: "closing_steps";          items: TaggedItem[]    }
  | { key: "acknowledgement";        items: EvidenceItem[]  }

export type ScenarioId =
  | "confirmed_fit"
  | "invisible_expert"
  | "narrative_gap"
  | "honest_verdict";

export type BattleCardVerdict = "hard_gap" | "framing_gap" | "terminology_gap" | "strong_match" | "evidence_gap";

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
  fitAdvice: FitAdviceEntry[];
  atsScore: number | null;
  threadId: string;
  _meta: { durationMs: number };
}
