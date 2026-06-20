export type RoleArchetype =
  | "specialist_depth"
  | "modernisation_refactor"
  | "greenfield_builder"
  | "founding_engineer"
  | "scale_operator"
  | "growth_hire";

export const ARCHETYPE_CONFIG: Record<RoleArchetype, { scanPattern: string; interviewProbePattern: string }> = {
  specialist_depth: {
    scanPattern: "The specific technology or domain name, held for multiple years at recognisable companies",
    interviewProbePattern: `Goes very deep on one thing. Multiple follow-up questions on the strongest claimed skill. "Walk me through exactly how you built X" — not "tell me about your experience with X."`,
  },
  modernisation_refactor: {
    scanPattern: "A recognisable before/after achievement — migrating a specific system, reducing a specific metric, decoupling a specific dependency",
    interviewProbePattern: "How did you manage risk? How did you keep systems running? How did you get stakeholder buy-in? They probe for the messy reality of transformation work, not just the clean outcome.",
  },
  greenfield_builder: {
    scanPattern: "A shipped new product or feature with clear ownership — not maintenance of existing systems",
    interviewProbePattern: "How do you make architectural decisions when there's no right answer? Walk me through the tradeoffs you considered. Tests judgment under ambiguity, not depth in any one technology.",
  },
  founding_engineer: {
    scanPattern: "Previous early-stage startup experience. Technical breadth. Evidence of ownership.",
    interviewProbePattern: "Why do you want to be at an early stage company? What would you do in the first 30 days? How do you decide what to build when everything is a priority? Tests temperament and judgment as much as technical skill.",
  },
  scale_operator: {
    scanPattern: "A specific scale number at a recognisable company",
    interviewProbePattern: "What's the largest system you've operated? What broke under load and how did you find it? Walk me through a specific architectural decision you made for scalability. Tests whether scale claims hold up under questioning.",
  },
  growth_hire: {
    scanPattern: "Trajectory — what has this person built or learned recently, not what they've been doing for five years",
    interviewProbePattern: "How do you approach learning something unfamiliar? What's something you taught yourself recently? Tests coachability and growth mindset.",
  },
};
