export interface Job {
  title: string;
  company?: string;
  requiredSkills: string[];
  niceToHaveSkills: string[];
  keywords: string[];
  experienceYears?: number;
  seniorityLevel?: "junior" | "mid" | "senior" | "lead" | "manager";
}
