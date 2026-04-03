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
    experience: {
        company: string;
        role: string;
        years: number;
    }[];
    education: {
        degree: string;
        institution: string;
    }[];
    totalYearsExperience?: number;
    keywords?: string[];
    careerNarrative: CareerNarrative;
}
