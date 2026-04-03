export interface MatchResult {
    score: number;
    matchedSkills: string[];
    missingSkills: string[];
    narrativeAlignment: string;
    gaps: string[];
    resumeAdvice: string[];
    weakMatch: boolean;
    weakMatchReason?: string;
}
