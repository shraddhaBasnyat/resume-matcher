import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { MatchResult } from "@/components/match/MatchResult";
import type { MatchResponse } from "@/lib/types/api";

const scoreColor = (n: number) =>
  n >= 70 ? "text-green-600" : n >= 50 ? "text-amber-600" : "text-red-600";

const BASE_META = { traceUrl: null, durationMs: 100 };

const BASE_ATS = {
  atsScore: null,
  missingKeywords: [],
  layoutFlags: [],
  terminologyGaps: [],
};

// ---------------------------------------------------------------------------
// Helpers to build minimal valid MatchResponse fixtures
// ---------------------------------------------------------------------------

function makeResult(overrides: Partial<MatchResponse>): MatchResponse {
  return {
    fitScore: 65,
    matchedSkills: ["TypeScript", "React"],
    missingSkills: ["Go"],
    narrativeAlignment: "Strong trajectory from frontend to full-stack.",
    weakMatch: false,
    weakMatchReason: null,
    atsProfile: BASE_ATS,
    fitAdvice: null,
    scenarioId: null,
    threadId: "thread-123",
    _meta: BASE_META,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// 1. Fallback panel — null scenarioId / null fitAdvice
//    This is the current production path when verdict nodes have not yet
//    produced a result (or the backend is partially wired).
// ---------------------------------------------------------------------------

describe("Fallback panel (null scenarioId / null fitAdvice)", () => {
  it("renders fitScore prominently", () => {
    render(<MatchResult result={makeResult({ fitScore: 72 })} scoreColor={scoreColor} />);
    expect(screen.getByText("72")).toBeInTheDocument();
    expect(screen.getByText("/ 100")).toBeInTheDocument();
  });

  it("renders narrativeAlignment", () => {
    render(<MatchResult result={makeResult()} scoreColor={scoreColor} />);
    expect(screen.getByText("Strong trajectory from frontend to full-stack.")).toBeInTheDocument();
  });

  it("renders matchedSkills", () => {
    render(<MatchResult result={makeResult()} scoreColor={scoreColor} />);
    expect(screen.getByText("TypeScript")).toBeInTheDocument();
    expect(screen.getByText("React")).toBeInTheDocument();
  });

  it("renders missingSkills", () => {
    render(<MatchResult result={makeResult()} scoreColor={scoreColor} />);
    expect(screen.getByText("Go")).toBeInTheDocument();
  });

  it("renders weakMatchReason when weakMatch is true", () => {
    render(
      <MatchResult
        result={makeResult({ weakMatch: true, weakMatchReason: "Critical gap in distributed systems." })}
        scoreColor={scoreColor}
      />
    );
    expect(screen.getByText("Critical gap in distributed systems.")).toBeInTheDocument();
  });

  it("does not render weakMatchReason when weakMatch is false", () => {
    render(
      <MatchResult
        result={makeResult({ weakMatch: false, weakMatchReason: "Should not appear." })}
        scoreColor={scoreColor}
      />
    );
    expect(screen.queryByText("Should not appear.")).not.toBeInTheDocument();
  });

  it("does not crash when matchedSkills and missingSkills are empty", () => {
    render(
      <MatchResult
        result={makeResult({ matchedSkills: [], missingSkills: [], narrativeAlignment: "" })}
        scoreColor={scoreColor}
      />
    );
    expect(screen.getByText("65")).toBeInTheDocument();
  });

  it("renders traceUrl link when present", () => {
    render(
      <MatchResult
        result={makeResult({ _meta: { traceUrl: "https://smith.langchain.com/trace/abc", durationMs: 100 } })}
        scoreColor={scoreColor}
      />
    );
    expect(screen.getByRole("link", { name: /langsmith/i })).toBeInTheDocument();
  });

  it("does not render traceUrl link when null", () => {
    render(<MatchResult result={makeResult()} scoreColor={scoreColor} />);
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// 2. honest_verdict — acknowledgement only appears when hitlFired + non-null
// ---------------------------------------------------------------------------

describe("HonestVerdictPanel — acknowledgement condition", () => {
  const honestBase = {
    scenarioId: "honest_verdict" as const,
    fitScore: 38,
    fitAdvice: {
      scenarioId: "honest_verdict" as const,
      hitlFired: false,
      honestAssessment: "The gap between your background and this role is real.",
      closingSteps: ["Close skill gap in distributed systems", "Target adjacent SRE roles"],
      acknowledgement: null,
    },
  };

  it("renders honestAssessment text", () => {
    render(<MatchResult result={makeResult(honestBase)} scoreColor={scoreColor} />);
    expect(
      screen.getByText("The gap between your background and this role is real.")
    ).toBeInTheDocument();
  });

  it("renders closingSteps as numbered list", () => {
    render(<MatchResult result={makeResult(honestBase)} scoreColor={scoreColor} />);
    expect(screen.getByText("Close skill gap in distributed systems")).toBeInTheDocument();
    expect(screen.getByText("Target adjacent SRE roles")).toBeInTheDocument();
  });

  it("does NOT render acknowledgement when hitlFired is false", () => {
    render(<MatchResult result={makeResult(honestBase)} scoreColor={scoreColor} />);
    expect(screen.queryByText(/acknowledgement/i)).not.toBeInTheDocument();
  });

  it("does NOT render acknowledgement when hitlFired is true but acknowledgement is null", () => {
    render(
      <MatchResult
        result={makeResult({
          ...honestBase,
          fitAdvice: { ...honestBase.fitAdvice, hitlFired: true, acknowledgement: null },
        })}
        scoreColor={scoreColor}
      />
    );
    // Only the honestAssessment should be visible, not an acknowledgement block
    expect(screen.getByText("The gap between your background and this role is real.")).toBeInTheDocument();
    expect(screen.queryByText(/we hear you/i)).not.toBeInTheDocument();
  });

  it("renders acknowledgement when hitlFired is true and acknowledgement is non-null", () => {
    const ack = "We hear you — two years leading that offline-first rollout is real engineering.";
    render(
      <MatchResult
        result={makeResult({
          ...honestBase,
          fitAdvice: {
            ...honestBase.fitAdvice,
            hitlFired: true,
            acknowledgement: ack,
          },
        })}
        scoreColor={scoreColor}
      />
    );
    expect(screen.getByText(ack)).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// 3. Smoke tests — each scenario panel renders without crashing
// ---------------------------------------------------------------------------

describe("Scenario panels — smoke tests", () => {
  it("confirmed_fit renders confirmation", () => {
    render(
      <MatchResult
        result={makeResult({
          fitScore: 85,
          scenarioId: "confirmed_fit",
          fitAdvice: {
            scenarioId: "confirmed_fit",
            confirmation: "You are a strong match.",
            standoutStrengths: ["10 years TypeScript"],
            minorGaps: [],
          },
        })}
        scoreColor={scoreColor}
      />
    );
    expect(screen.getByText("You are a strong match.")).toBeInTheDocument();
  });

  it("invisible_expert renders atsRealityCheck prominently", () => {
    render(
      <MatchResult
        result={makeResult({
          fitScore: 80,
          scenarioId: "invisible_expert",
          fitAdvice: {
            scenarioId: "invisible_expert",
            confirmation: "Your skills align well.",
            standoutStrengths: ["Strong distributed systems background"],
            minorGaps: [],
            atsRealityCheck: "Your resume uses 'microservices' but the JD says 'service-oriented architecture'.",
            terminologySwaps: [],
            keywordsToAdd: [],
            layoutAdvice: [],
          },
        })}
        scoreColor={scoreColor}
      />
    );
    expect(
      screen.getByText("Your resume uses 'microservices' but the JD says 'service-oriented architecture'.")
    ).toBeInTheDocument();
  });

  it("narrative_gap renders narrativeBridge", () => {
    render(
      <MatchResult
        result={makeResult({
          fitScore: 58,
          scenarioId: "narrative_gap",
          fitAdvice: {
            scenarioId: "narrative_gap",
            narrativeBridge: "Your ops experience maps directly to this platform engineering role.",
            reframingSuggestions: [],
            transferableStrengths: [],
            missingSkills: [],
          },
        })}
        scoreColor={scoreColor}
      />
    );
    expect(
      screen.getByText("Your ops experience maps directly to this platform engineering role.")
    ).toBeInTheDocument();
  });
});
