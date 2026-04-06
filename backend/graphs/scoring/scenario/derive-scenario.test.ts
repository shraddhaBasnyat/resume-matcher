import { describe, it, expect } from "vitest";
import {
  deriveScenario,
  STRONG_FIT_THRESHOLD,
  WEAK_FIT_THRESHOLD,
  ATS_THRESHOLD,
} from "./derive-scenario";
import type { ArchetypeContext } from "../../../archetypes/types";
// Minimal ArchetypeContext fixture
const archetype: ArchetypeContext = {
  archetypeId: "pm-to-tpm",
  label: "PM to TPM",
  skillMap: { tier1: [], tier2: [], tier3: [] },
  gapProfile: [],
  hiddenStrengths: [],
  credibilitySignals: [],
  mentalModelShift: { from: "product", to: "technical", practicalImplication: "..." },
};

describe("deriveScenario", () => {
  // ---------------------------------------------------------------------------
  // Priority 1 — hitlFired always returns 4b
  // ---------------------------------------------------------------------------

  describe("scenario 4b — hitlFired override", () => {
    it("returns 4b when hitlFired is true regardless of fitScore", () => {
      const result = deriveScenario(90, 90, "confident_match", null, "base", true);
      expect(result.scenarioId).toBe("4b");
      expect(result.verdictNode).toBe("analyzeSkepticalReconciliation");
      expect(result.runRoadmap).toBe(true);
    });

    it("returns 4b even when fitScore would otherwise trigger 1a", () => {
      const result = deriveScenario(STRONG_FIT_THRESHOLD, 90, "confident_match", null, "base", true);
      expect(result.scenarioId).toBe("4b");
    });

    it("fires runATS when atsScore < threshold in 4b", () => {
      const result = deriveScenario(90, ATS_THRESHOLD - 1, "confident_match", null, "base", true);
      expect(result.runATS).toBe(true);
    });

    it("does not fire runATS when atsScore >= threshold in 4b", () => {
      const result = deriveScenario(90, ATS_THRESHOLD, "confident_match", null, "base", true);
      expect(result.runATS).toBe(false);
    });

    it("does not fire runATS when atsScore is undefined in 4b", () => {
      const result = deriveScenario(90, undefined, "confident_match", null, "base", true);
      expect(result.runATS).toBe(false);
    });
  });

  // ---------------------------------------------------------------------------
  // Scenario 1b — strong fit but low ATS
  // ---------------------------------------------------------------------------

  describe("scenario 1b — strong fit, low ATS", () => {
    it("returns 1b when fitScore >= threshold and atsScore < threshold", () => {
      const result = deriveScenario(STRONG_FIT_THRESHOLD, ATS_THRESHOLD - 1, "confident_match", null, "base", false);
      expect(result.scenarioId).toBe("1b");
      expect(result.verdictNode).toBe("analyzeStrongMatch");
      expect(result.runRoadmap).toBe(false);
      expect(result.runATS).toBe(true);
    });

    it("returns 1b at fitScore 80 and atsScore 60", () => {
      const result = deriveScenario(80, 60, "confident_match", null, "base", false);
      expect(result.scenarioId).toBe("1b");
    });
  });

  // ---------------------------------------------------------------------------
  // Scenario 1a — strong fit, ATS ok or undefined
  // ---------------------------------------------------------------------------

  describe("scenario 1a — strong fit, ATS ok", () => {
    it("returns 1a when fitScore >= threshold and atsScore >= ATS threshold", () => {
      const result = deriveScenario(STRONG_FIT_THRESHOLD, ATS_THRESHOLD, "confident_match", null, "base", false);
      expect(result.scenarioId).toBe("1a");
      expect(result.verdictNode).toBe("analyzeStrongMatch");
      expect(result.runRoadmap).toBe(false);
      expect(result.runATS).toBe(false);
    });

    it("returns 1a when fitScore >= threshold and atsScore is undefined", () => {
      const result = deriveScenario(STRONG_FIT_THRESHOLD, undefined, "confident_match", null, "base", false);
      expect(result.scenarioId).toBe("1a");
      expect(result.runATS).toBe(false);
    });

    it("1a always has runATS false even without explicit atsScore", () => {
      const result = deriveScenario(90, undefined, "confident_match", archetype, "paid", false);
      expect(result.scenarioId).toBe("1a");
      expect(result.runATS).toBe(false);
    });
  });

  // ---------------------------------------------------------------------------
  // Scenario 7 — exploring_gap, moderate fit
  // ---------------------------------------------------------------------------

  describe("scenario 7 — exploring_gap, fitScore >= 50", () => {
    it("returns 7 not 2 when intent is exploring_gap and fitScore is 60", () => {
      const result = deriveScenario(60, undefined, "exploring_gap", null, "base", false);
      expect(result.scenarioId).toBe("7");
      expect(result.verdictNode).toBe("analyzeNarrativeGap");
      expect(result.runRoadmap).toBe(true);
    });

    it("returns 7 at exactly WEAK_FIT_THRESHOLD", () => {
      const result = deriveScenario(WEAK_FIT_THRESHOLD, undefined, "exploring_gap", null, "base", false);
      expect(result.scenarioId).toBe("7");
    });

    it("fires runATS in scenario 7 when atsScore < threshold", () => {
      const result = deriveScenario(60, ATS_THRESHOLD - 1, "exploring_gap", null, "base", false);
      expect(result.runATS).toBe(true);
    });

    it("does not fire runATS in scenario 7 when atsScore is undefined", () => {
      const result = deriveScenario(60, undefined, "exploring_gap", null, "base", false);
      expect(result.runATS).toBe(false);
    });
  });

  // ---------------------------------------------------------------------------
  // Scenario 6 — exploring_gap, low fit
  // ---------------------------------------------------------------------------

  describe("scenario 6 — exploring_gap, fitScore < 50", () => {
    it("returns 6 not 4a when intent is exploring_gap and fitScore is 40", () => {
      const result = deriveScenario(40, undefined, "exploring_gap", null, "base", false);
      expect(result.scenarioId).toBe("6");
      expect(result.verdictNode).toBe(null);
      expect(result.runRoadmap).toBe(true);
    });

    it("returns 6 at fitScore 49 (just below threshold)", () => {
      const result = deriveScenario(WEAK_FIT_THRESHOLD - 1, undefined, "exploring_gap", null, "base", false);
      expect(result.scenarioId).toBe("6");
    });

    it("fires runATS in scenario 6 when atsScore < threshold", () => {
      const result = deriveScenario(40, ATS_THRESHOLD - 1, "exploring_gap", null, "base", false);
      expect(result.runATS).toBe(true);
    });
  });

  // ---------------------------------------------------------------------------
  // Scenario 3 — archetype + paid tier
  // ---------------------------------------------------------------------------

  describe("scenario 3 — archetype gap, paid tier", () => {
    it("returns 3 when fitScore >= 50, archetypeContext set, and userTier is paid", () => {
      const result = deriveScenario(60, undefined, "confident_match", archetype, "paid", false);
      expect(result.scenarioId).toBe("3");
      expect(result.verdictNode).toBe("analyzeArchetypeGap");
      expect(result.runRoadmap).toBe(false);
    });

    it("returns 2 not 3 when userTier is base even with archetype context (tier gate)", () => {
      const result = deriveScenario(60, undefined, "confident_match", archetype, "base", false);
      expect(result.scenarioId).toBe("2");
    });

    it("returns 2 not 3 when archetypeContext is null even with paid tier", () => {
      const result = deriveScenario(60, undefined, "confident_match", null, "paid", false);
      expect(result.scenarioId).toBe("2");
    });

    it("fires runATS in scenario 3 when atsScore < threshold", () => {
      const result = deriveScenario(60, ATS_THRESHOLD - 1, "confident_match", archetype, "paid", false);
      expect(result.runATS).toBe(true);
    });
  });

  // ---------------------------------------------------------------------------
  // Scenario 2 — narrative gap
  // ---------------------------------------------------------------------------

  describe("scenario 2 — narrative gap", () => {
    it("returns 2 for moderate fit confident_match without archetype", () => {
      const result = deriveScenario(60, undefined, "confident_match", null, "base", false);
      expect(result.scenarioId).toBe("2");
      expect(result.verdictNode).toBe("analyzeNarrativeGap");
      expect(result.runRoadmap).toBe(false);
    });

    it("fires runATS in scenario 2 when atsScore < threshold", () => {
      const result = deriveScenario(60, ATS_THRESHOLD - 1, "confident_match", null, "base", false);
      expect(result.runATS).toBe(true);
    });

    it("does not fire runATS in scenario 2 when atsScore >= threshold", () => {
      const result = deriveScenario(60, ATS_THRESHOLD, "confident_match", null, "base", false);
      expect(result.runATS).toBe(false);
    });
  });

  // ---------------------------------------------------------------------------
  // Scenario 4a — low fit, confident_match (first-pass)
  // ---------------------------------------------------------------------------

  describe("scenario 4a — low fit, confident_match", () => {
    it("returns 4a for fitScore < 50 with confident_match", () => {
      const result = deriveScenario(40, undefined, "confident_match", null, "base", false);
      expect(result.scenarioId).toBe("4a");
      expect(result.verdictNode).toBe("analyzeSkepticalReconciliation");
      expect(result.runRoadmap).toBe(false);
    });

    it("fires runATS in scenario 4a when atsScore < threshold", () => {
      const result = deriveScenario(40, ATS_THRESHOLD - 1, "confident_match", null, "base", false);
      expect(result.runATS).toBe(true);
    });
  });

  // ---------------------------------------------------------------------------
  // Scenario 5 — not derived here (node handles 4a vs 5 distinction)
  // ---------------------------------------------------------------------------

  it("never returns scenarioId 5 — scenario 5 is determined at runtime by the node", () => {
    const inputs: Array<Parameters<typeof deriveScenario>> = [
      [10, undefined, "confident_match", null, "base", false],
      [10, undefined, "exploring_gap", null, "base", false],
      [50, undefined, "confident_match", null, "base", false],
      [90, undefined, "confident_match", null, "base", false],
      [90, 50, "confident_match", archetype, "paid", true],
    ];
    for (const args of inputs) {
      expect(deriveScenario(...args).scenarioId).not.toBe("5");
    }
  });

  // ---------------------------------------------------------------------------
  // Boundary values
  // ---------------------------------------------------------------------------

  describe("boundary values", () => {
    it("fitScore exactly 75 goes to 1a (not 2 or 3)", () => {
      const result = deriveScenario(STRONG_FIT_THRESHOLD, undefined, "confident_match", null, "base", false);
      expect(result.scenarioId).toBe("1a");
    });

    it("fitScore exactly 50 goes to 7 when exploring_gap", () => {
      const result = deriveScenario(WEAK_FIT_THRESHOLD, undefined, "exploring_gap", null, "base", false);
      expect(result.scenarioId).toBe("7");
    });

    it("fitScore exactly 50 goes to 2 when confident_match without archetype", () => {
      const result = deriveScenario(WEAK_FIT_THRESHOLD, undefined, "confident_match", null, "base", false);
      expect(result.scenarioId).toBe("2");
    });

    it("fitScore 49 goes to 6 when exploring_gap", () => {
      const result = deriveScenario(WEAK_FIT_THRESHOLD - 1, undefined, "exploring_gap", null, "base", false);
      expect(result.scenarioId).toBe("6");
    });

    it("fitScore 49 goes to 4a when confident_match", () => {
      const result = deriveScenario(WEAK_FIT_THRESHOLD - 1, undefined, "confident_match", null, "base", false);
      expect(result.scenarioId).toBe("4a");
    });

    it("atsScore exactly 75 does NOT fire runATS", () => {
      const result = deriveScenario(60, ATS_THRESHOLD, "confident_match", null, "base", false);
      expect(result.runATS).toBe(false);
    });

    it("atsScore 74 fires runATS", () => {
      const result = deriveScenario(60, ATS_THRESHOLD - 1, "confident_match", null, "base", false);
      expect(result.runATS).toBe(true);
    });

    it("fitScore 74 goes to 1b when atsScore < threshold", () => {
      const result = deriveScenario(STRONG_FIT_THRESHOLD - 1, ATS_THRESHOLD - 1, "confident_match", null, "base", false);
      expect(result.scenarioId).not.toBe("1b");
      // 74 is below STRONG_FIT_THRESHOLD, so 1b cannot be reached here
      expect(result.scenarioId).toBe("2");
    });
  });
});
