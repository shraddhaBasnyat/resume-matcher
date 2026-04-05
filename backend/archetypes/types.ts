export interface SkillEntry {
  name: string;
  weight: number;
  notes?: string;
}

export interface SkillMap {
  tier1: SkillEntry[];
  tier2: SkillEntry[];
  tier3: SkillEntry[];
}

export interface GapEntry {
  gap: string;
  severity: "critical" | "high" | "medium";
  failureMode: string;
  howToClose: string;
}

export interface HiddenStrength {
  strength: string;
  why: string;
}

export interface CredibilitySignal {
  signal: string;
  priority: number;
}

export interface MentalModelShift {
  from: string;
  to: string;
  practicalImplication: string;
}

export interface Archetype {
  label: string;
  skillMap: SkillMap;
  gapProfile: GapEntry[];
  hiddenStrengths: HiddenStrength[];
  credibilitySignals: CredibilitySignal[];
  mentalModelShift: MentalModelShift;
}

/**
 * The selectively-projected object passed into graph nodes.
 * Contains all archetype data — each node filters to what it needs at injection time.
 * buildContext() returns this full projection; filtering (tier1, critical/high) happens
 * in the node or chain, not here.
 */
export interface ArchetypeContext {
  archetypeId: string;
  label: string;
  skillMap: SkillMap;
  gapProfile: GapEntry[];
  hiddenStrengths: HiddenStrength[];
  credibilitySignals: CredibilitySignal[];
  mentalModelShift: MentalModelShift;
}
