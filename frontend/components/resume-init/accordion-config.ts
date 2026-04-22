export const ACCORDION_CONFIG: Record<string, { question: string; subtitle: string }> = {
  // invisible_expert
  standout_strengths: { question: "What makes you stand out?",         subtitle: "strengths" },
  ats_reality_check:  { question: "Why aren't you getting interviews?", subtitle: "signals" },
  terminology_swaps:  { question: "How should you reword your resume?", subtitle: "swaps" },
  keywords_to_add:    { question: "What keywords should you add?",      subtitle: "keywords" },
  // narrative_gap
  transferable_strengths: { question: "What experience transfers directly?", subtitle: "strengths" },
  reframing_suggestions:  { question: "How should you retell your story?",   subtitle: "suggestions" },
  missing_skills:         { question: "What gaps are genuinely there?",      subtitle: "gaps" },
  // honest_verdict
  honest_assessment: { question: "Why is the gap real?",          subtitle: "reasons" },
  closing_steps:     { question: "What would it actually take?",  subtitle: "steps" },
  acknowledgement:   { question: "What did your context change?", subtitle: "updates" },
};
