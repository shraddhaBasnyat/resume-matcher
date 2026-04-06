import type { GraphStateType } from "../scoring-graph-state.js";

export function makeAtsAnalysisNode() {
  return async function atsAnalysis(_state: GraphStateType) {
    // TODO: implement ATS analysis chain — reads resumeText and jobText, returns
    // atsScore (0–100), missingKeywords, layoutFlags, terminologyGaps.
    return {
      atsProfile: {
        atsScore: null,
        missingKeywords: [] as string[],
        layoutFlags: [] as string[],
        terminologyGaps: [] as string[],
      },
    };
  };
}
