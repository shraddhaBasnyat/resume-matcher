import { describe, it, expect } from "vitest";
import { atsGapAnalysis } from "../graphs/scoring/nodes/ats-gap-analysis.js";
import type { GraphStateType } from "../graphs/scoring/scoring-graph-state.js";

function buildState(recruiterFilter: string, resumeText: string): GraphStateType {
  return {
    resumeText,
    jobText: "",
    recruiterFilter,
    demonstratedVsClaimed: [],
  } as unknown as GraphStateType;
}

describe("atsGapAnalysis — atsAha generation", () => {
  it("no terms: returns no-terms aha and atsScore 100", async () => {
    const result = await atsGapAnalysis(buildState("", "any resume text"));
    expect(result.atsAha).toBe(
      "No recruiter filter terms identified from the job description.",
    );
    expect(result.atsScore).toBe(100);
  });

  it("all terms found: returns all-found aha", async () => {
    const result = await atsGapAnalysis(
      buildState("kubernetes, docker", "experienced with kubernetes and docker in production"),
    );
    expect(result.atsAha).toBe(
      "Resume surfaces for all recruiter filter terms — ATS visibility is not the bottleneck.",
    );
    expect(result.atsScore).toBeGreaterThan(0);
  });

  it("all terms missing: returns all-missing aha and atsScore 0", async () => {
    const result = await atsGapAnalysis(
      buildState("kubernetes, docker, terraform", "senior software engineer with java experience"),
    );
    expect(result.atsAha).toBe(
      "Resume does not surface for any recruiter filter terms — missing: kubernetes, docker, terraform.",
    );
    expect(result.atsScore).toBe(0);
  });

  it("some terms missing: returns partial aha with count and missing list", async () => {
    const result = await atsGapAnalysis(
      buildState("kubernetes, docker, terraform", "experienced with kubernetes in production"),
    );
    expect(result.atsAha).toBe(
      "Resume matches 1 of 3 recruiter filter terms — missing: docker, terraform.",
    );
    expect(result.atsScore).toBeGreaterThan(0);
    expect(result.atsScore).toBeLessThan(100);
  });
});
