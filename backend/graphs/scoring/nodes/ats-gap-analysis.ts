import type { GraphStateType } from "../scoring-graph-state.js";

type TermStatus = "missing" | "present_no_context" | "present_demonstrated";

function buildAtsAha(termGaps: { term: string; status: TermStatus }[]): string {
  const total = termGaps.length;
  if (total === 0) {
    return "No recruiter filter terms identified from the job description.";
  }
  const missing = termGaps.filter((g) => g.status === "missing");
  const missingCount = missing.length;
  if (missingCount === 0) {
    return "Resume surfaces for all recruiter filter terms — ATS visibility is not the bottleneck.";
  }
  if (missingCount === total) {
    const missingList = missing.map((g) => g.term).join(", ");
    return `Resume does not surface for any recruiter filter terms — missing: ${missingList}.`;
  }
  const presentCount = total - missingCount;
  const missingList = missing.map((g) => g.term).join(", ");
  return `Resume matches ${presentCount} of ${total} recruiter filter terms — missing: ${missingList}.`;
}

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

  const atsAha = buildAtsAha(termGaps);

  return {
    atsScore,
    termGaps,
    atsAha,
    terminologyMismatches: [] as { resumeUses: string; jdExpects: string }[],
    formattingFlags: [] as string[],
  };
}
