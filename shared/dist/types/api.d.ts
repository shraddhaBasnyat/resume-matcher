import type { Resume } from "./resume.js";
import type { Job } from "./job.js";
export interface RunMatchRequest {
    resumeText: string;
    jobText: string;
    humanContext?: string;
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
export interface MatchResponse {
    score: number;
    matchedSkills: string[];
    missingSkills: string[];
    narrativeAlignment: string;
    gaps: string[];
    resumeAdvice: string[];
    weakMatch: boolean;
    weakMatchReason?: string;
    resumeData: Resume;
    jobData: Job;
    interrupted: boolean;
    threadId: string;
    _meta: {
        traceUrl: string | null;
        durationMs: number;
    };
}
