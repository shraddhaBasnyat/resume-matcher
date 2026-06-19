import type { GraphStateType } from "../scoring-graph-state.js";

type TermStatus = "missing" | "present_no_context" | "present_demonstrated";

function parseTerms(recruiterFilter: string): string[] {
  return recruiterFilter
    .split(/,|\bAND\b|\bOR\b/i)
    .map((t) => t.trim())
    .filter((t) => t.length > 0);
}

export async function atsGapAnalysis(state: GraphStateType) {
  const recruiterFilter = state.recruiterFilter ?? "";
  const resumeText = state.resumeText.toLowerCase();
  const demonstratedVsClaimed = state.demonstratedVsClaimed ?? [];

  const terms = parseTerms(recruiterFilter);

  const termGaps: { term: string; status: TermStatus }[] = terms.map((term) => {
    const termLower = term.toLowerCase();
    const present = resumeText.includes(termLower);
    if (!present) return { term, status: "missing" as const };

    const isDemonstrated = demonstratedVsClaimed.some(
      (item) =>
        item.bullet.toLowerCase().includes(termLower) && item.status === "demonstrated",
    );
    return { term, status: isDemonstrated ? "present_demonstrated" as const : "present_no_context" as const };
  });

  const atsScore =
    terms.length === 0
      ? 100
      : Math.round(
          (termGaps.reduce((sum, { status }) => {
            if (status === "present_demonstrated") return sum + 1;
            if (status === "present_no_context") return sum + 0.5;
            return sum;
          }, 0) /
            terms.length) *
            100,
        );

  return {
    atsScore,
    termGaps,
    terminologyMismatches: [] as { resumeUses: string; jdExpects: string }[],
    formattingFlags: [] as string[],
  };
}
