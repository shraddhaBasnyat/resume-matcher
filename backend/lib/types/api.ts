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
}

export interface Job {
  title: string;
  company?: string;
  requiredSkills: string[];
  niceToHaveSkills: string[];
  keywords: string[];
  experienceYears?: number;
  seniorityLevel?: "junior" | "mid" | "senior" | "lead" | "manager";
}

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
  _meta: { traceUrl: string | null; durationMs: number };
}
