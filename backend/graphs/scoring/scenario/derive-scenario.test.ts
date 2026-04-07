import { describe, it, expect } from "vitest";
import {
  deriveScenario,
  STRONG_FIT_THRESHOLD,
  WEAK_FIT_THRESHOLD,
  ATS_THRESHOLD,
} from "./derive-scenario";

// ---------------------------------------------------------------------------
// confirmed_fit — strong fit, ATS ok or undefined
// ---------------------------------------------------------------------------

describe("confirmed_fit — fitScore >= 75, atsScore >= 75 or undefined", () => {
  it("returns confirmed_fit when fitScore >= threshold and atsScore is undefined", () => {
    const result = deriveScenario(STRONG_FIT_THRESHOLD, undefined);
    expect(result.scenarioId).toBe("confirmed_fit");
    expect(result.verdictNode).toBe("analyzeStrongMatch");
  });

  it("returns confirmed_fit when fitScore >= threshold and atsScore >= ATS threshold", () => {
    const result = deriveScenario(STRONG_FIT_THRESHOLD, ATS_THRESHOLD);
    expect(result.scenarioId).toBe("confirmed_fit");
    expect(result.verdictNode).toBe("analyzeStrongMatch");
  });

  it("returns confirmed_fit at fitScore 90 with atsScore undefined", () => {
    const result = deriveScenario(90, undefined);
    expect(result.scenarioId).toBe("confirmed_fit");
  });

  it("returns confirmed_fit at fitScore 90 with atsScore 80 (above ATS threshold)", () => {
    const result = deriveScenario(90, 80);
    expect(result.scenarioId).toBe("confirmed_fit");
  });

  it("returns confirmed_fit at atsScore exactly 75", () => {
    const result = deriveScenario(80, ATS_THRESHOLD);
    expect(result.scenarioId).toBe("confirmed_fit");
  });
});

// ---------------------------------------------------------------------------
// invisible_expert — strong fit, ATS below threshold
// ---------------------------------------------------------------------------

describe("invisible_expert — fitScore >= 75, atsScore < 75", () => {
  it("returns invisible_expert when fitScore >= threshold and atsScore < ATS threshold", () => {
    const result = deriveScenario(STRONG_FIT_THRESHOLD, ATS_THRESHOLD - 1);
    expect(result.scenarioId).toBe("invisible_expert");
    expect(result.verdictNode).toBe("analyzeStrongMatch");
  });

  it("returns invisible_expert at fitScore 80 and atsScore 60", () => {
    const result = deriveScenario(80, 60);
    expect(result.scenarioId).toBe("invisible_expert");
  });

  it("returns invisible_expert at atsScore 0", () => {
    const result = deriveScenario(90, 0);
    expect(result.scenarioId).toBe("invisible_expert");
  });

  it("atsScore undefined never triggers invisible_expert", () => {
    const result = deriveScenario(90, undefined);
    expect(result.scenarioId).not.toBe("invisible_expert");
    expect(result.scenarioId).toBe("confirmed_fit");
  });
});

// ---------------------------------------------------------------------------
// narrative_gap — fitScore 50–74
// ---------------------------------------------------------------------------

describe("narrative_gap — fitScore 50–74, any atsScore", () => {
  it("returns narrative_gap for fitScore 60 with atsScore undefined", () => {
    const result = deriveScenario(60, undefined);
    expect(result.scenarioId).toBe("narrative_gap");
    expect(result.verdictNode).toBe("analyzeNarrativeGap");
  });

  it("returns narrative_gap for fitScore 60 with low atsScore", () => {
    const result = deriveScenario(60, ATS_THRESHOLD - 1);
    expect(result.scenarioId).toBe("narrative_gap");
  });

  it("returns narrative_gap for fitScore exactly 50 (WEAK_FIT_THRESHOLD)", () => {
    const result = deriveScenario(WEAK_FIT_THRESHOLD, undefined);
    expect(result.scenarioId).toBe("narrative_gap");
  });

  it("returns narrative_gap for fitScore exactly 74 (one below STRONG_FIT_THRESHOLD)", () => {
    const result = deriveScenario(STRONG_FIT_THRESHOLD - 1, undefined);
    expect(result.scenarioId).toBe("narrative_gap");
  });

  it("returns narrative_gap regardless of intent or archetype (routing is score-only)", () => {
    // Confirm that mid-fit always → narrative_gap, intent/archetype are not inputs
    expect(deriveScenario(62, undefined).scenarioId).toBe("narrative_gap");
    expect(deriveScenario(70, 80).scenarioId).toBe("narrative_gap");
  });
});

// ---------------------------------------------------------------------------
// honest_verdict — fitScore < 50
// ---------------------------------------------------------------------------

describe("honest_verdict — fitScore < 50, any atsScore", () => {
  it("returns honest_verdict for fitScore < WEAK_FIT_THRESHOLD with atsScore undefined", () => {
    const result = deriveScenario(WEAK_FIT_THRESHOLD - 1, undefined);
    expect(result.scenarioId).toBe("honest_verdict");
    expect(result.verdictNode).toBe("analyzeSkepticalReconciliation");
  });

  it("returns honest_verdict for fitScore 40 with low atsScore", () => {
    const result = deriveScenario(40, ATS_THRESHOLD - 1);
    expect(result.scenarioId).toBe("honest_verdict");
  });

  it("returns honest_verdict for fitScore 0", () => {
    const result = deriveScenario(0, undefined);
    expect(result.scenarioId).toBe("honest_verdict");
  });

  it("returns honest_verdict regardless of atsScore when fitScore < 50", () => {
    expect(deriveScenario(35, undefined).scenarioId).toBe("honest_verdict");
    expect(deriveScenario(35, 80).scenarioId).toBe("honest_verdict");
    expect(deriveScenario(35, 40).scenarioId).toBe("honest_verdict");
  });
});

// ---------------------------------------------------------------------------
// Boundary values
// ---------------------------------------------------------------------------

describe("boundary values", () => {
  it("fitScore exactly 75 → confirmed_fit (strong fit threshold is inclusive)", () => {
    expect(deriveScenario(STRONG_FIT_THRESHOLD, undefined).scenarioId).toBe("confirmed_fit");
  });

  it("fitScore exactly 74 → narrative_gap (below strong fit threshold)", () => {
    expect(deriveScenario(STRONG_FIT_THRESHOLD - 1, undefined).scenarioId).toBe("narrative_gap");
  });

  it("fitScore exactly 50 → narrative_gap (weak fit threshold is inclusive)", () => {
    expect(deriveScenario(WEAK_FIT_THRESHOLD, undefined).scenarioId).toBe("narrative_gap");
  });

  it("fitScore exactly 49 → honest_verdict (below weak fit threshold)", () => {
    expect(deriveScenario(WEAK_FIT_THRESHOLD - 1, undefined).scenarioId).toBe("honest_verdict");
  });

  it("atsScore exactly 75 → confirmed_fit (ATS threshold is inclusive)", () => {
    expect(deriveScenario(80, ATS_THRESHOLD).scenarioId).toBe("confirmed_fit");
  });

  it("atsScore exactly 74 → invisible_expert (below ATS threshold)", () => {
    expect(deriveScenario(80, ATS_THRESHOLD - 1).scenarioId).toBe("invisible_expert");
  });

  it("fitScore 75 with atsScore 74 → invisible_expert (strong fit but ATS fails)", () => {
    const result = deriveScenario(STRONG_FIT_THRESHOLD, ATS_THRESHOLD - 1);
    expect(result.scenarioId).toBe("invisible_expert");
  });
});

// ---------------------------------------------------------------------------
// verdictNode mapping
// ---------------------------------------------------------------------------

describe("verdictNode mapping", () => {
  it("confirmed_fit maps to analyzeStrongMatch", () => {
    expect(deriveScenario(80, undefined).verdictNode).toBe("analyzeStrongMatch");
  });

  it("invisible_expert maps to analyzeStrongMatch", () => {
    expect(deriveScenario(80, 60).verdictNode).toBe("analyzeStrongMatch");
  });

  it("narrative_gap maps to analyzeNarrativeGap", () => {
    expect(deriveScenario(60, undefined).verdictNode).toBe("analyzeNarrativeGap");
  });

  it("honest_verdict maps to analyzeSkepticalReconciliation", () => {
    expect(deriveScenario(35, undefined).verdictNode).toBe("analyzeSkepticalReconciliation");
  });
});
