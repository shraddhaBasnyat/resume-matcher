import { describe, it, expect, vi, beforeEach } from "vitest";
import { runMatchGraph } from "../src/infra/runner.js";

// ---------------------------------------------------------------------------
// Module mocks
// ---------------------------------------------------------------------------

const { mockGetState, mockInvoke } = vi.hoisted(() => ({
  mockGetState: vi.fn(),
  mockInvoke: vi.fn(),
}));

vi.mock("../graphs/scoring/scoring-graph-instance.js", () => ({
  graph: {
    getState: mockGetState,
    invoke: mockInvoke,
  },
}));

// ---------------------------------------------------------------------------
// Shared fixtures — must match current graph state shape and PublicMatchResponseSchema
// ---------------------------------------------------------------------------

const checkpointedState = {
  scenarioId: "honest_verdict",
  fitScore: 42,
  headline: "Frontend Developer without the backend depth this role requires",
  battleCardBullets: [
    { requirement: "5+ years backend systems", evidence: "3 years frontend only", verdict: "hard_gap" as const },
    { requirement: "Distributed architecture ownership", evidence: "No distributed architecture in history", verdict: "hard_gap" as const },
  ],
  fitAdvice: {
    scenarioId: "honest_verdict",
    honestAssessment: ["Three of the five required skills are absent."],
    closingSteps: ["Build and ship a production backend service end-to-end."],
    acknowledgement: null,
  },
  atsProfile: {
    atsScore: 55,
    machineParsing: ["// TODO: replace with programmatic resume parsing analysis"],
    machineRanking: ["missing keyword: 'distributed systems'"],
  },
  closingSummary: "The gap is real and the score stands — this is a 2–3 year path to close.",
  threadId: "thread-123",
};

function buildAcceptOptions(overrides: Partial<Parameters<typeof runMatchGraph>[0]> = {}) {
  const emitted: { event: string; data: object }[] = [];
  const closed = vi.fn();
  return {
    options: {
      kind: "accept" as const,
      threadId: "thread-123",
      emit: (event: string, data: object) => emitted.push({ event, data }),
      close: closed,
      abort: new AbortController(),
      ...overrides,
    },
    emitted,
    closed,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("runMatchGraph — kind: accept", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetState.mockResolvedValue({
      values: checkpointedState,
      next: [],
    });
  });

  it("emits a completed event with the checkpointed match result", async () => {
    const { options, emitted, closed } = buildAcceptOptions();

    await runMatchGraph(options);

    const completedEvents = emitted.filter((e) => e.event === "completed");
    expect(completedEvents).toHaveLength(1);

    const { result } = completedEvents[0].data as { result: Record<string, unknown> };
    expect(result.fitScore).toBe(42);
    expect(result.scenarioId).toBe("honest_verdict");
    expect(result.threadId).toBe("thread-123");
    expect((result.scenarioSummary as Record<string, unknown>).text).toBe(
      checkpointedState.closingSummary,
    );
    expect(closed).toHaveBeenCalledOnce();
  });

  it("does not include internal graph fields in the completed event", async () => {
    const { options, emitted } = buildAcceptOptions();

    await runMatchGraph(options);

    const { result } = (emitted.find((e) => e.event === "completed")!.data) as {
      result: Record<string, unknown>;
    };
    expect(result.resumeData).toBeUndefined();
    expect(result.jobData).toBeUndefined();
    expect(result.fitAnalysis).toBeUndefined();
    expect(result.closingSummary).toBeUndefined();
  });

  it("never invokes the graph (no scoring or gap analysis)", async () => {
    const { options } = buildAcceptOptions();

    await runMatchGraph(options);

    expect(mockInvoke).not.toHaveBeenCalled();
  });

  it("calls getState with the correct threadId config", async () => {
    const { options } = buildAcceptOptions({ threadId: "my-specific-thread" });

    await runMatchGraph(options);

    expect(mockGetState).toHaveBeenCalledWith({
      configurable: { thread_id: "my-specific-thread" },
    });
  });

  it("emits an error event when fitScore is missing from the snapshot", async () => {
    mockGetState.mockResolvedValue({
      values: { ...checkpointedState, fitScore: undefined, scenarioId: undefined },
      next: [],
    });
    const { options, emitted, closed } = buildAcceptOptions();

    await runMatchGraph(options);

    const errorEvents = emitted.filter((e) => e.event === "error");
    expect(errorEvents).toHaveLength(1);
    expect((errorEvents[0].data as { error: string }).error).toBe("Incomplete graph result");
    expect(closed).toHaveBeenCalledOnce();
  });

  it("emits an error event and still closes when getState throws", async () => {
    mockGetState.mockRejectedValue(new Error("checkpointer unavailable"));
    const { options, emitted, closed } = buildAcceptOptions();

    await runMatchGraph(options);

    const errorEvents = emitted.filter((e) => e.event === "error");
    expect(errorEvents).toHaveLength(1);
    expect((errorEvents[0].data as { message: string }).message).toContain("checkpointer unavailable");
    expect(closed).toHaveBeenCalledOnce();
  });

  it("includes _meta with a durationMs in the completed payload", async () => {
    const { options, emitted } = buildAcceptOptions();

    await runMatchGraph(options);

    const { result } = (emitted.find((e) => e.event === "completed")!.data) as {
      result: { _meta: { durationMs: number } };
    };
    expect(typeof result._meta.durationMs).toBe("number");
    expect(result._meta.durationMs).toBeGreaterThanOrEqual(0);
  });
});
