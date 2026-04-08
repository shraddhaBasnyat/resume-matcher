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

vi.mock("../langsmith.js", () => ({
  isTracingEnabled: () => false,
  getTraceUrl: vi.fn(),
  RootRunCapture: vi.fn(),
  RUN_NAMES: {
    COMPLETED: "resume-match-graph: completed",
    CANCELLED: "resume-match-graph: cancelled-by-human",
    HITL_RESUMED: "resume-match-graph: hitl-resumed",
    FAILED: "resume-match-graph: failed",
  },
}));

// ---------------------------------------------------------------------------
// Shared fixtures
// ---------------------------------------------------------------------------

const checkpointedMatchResult = {
  fitScore: 42,
  matchedSkills: ["TypeScript"],
  missingSkills: ["Kubernetes", "Docker"],
  narrativeAlignment: "Decent frontend background but missing DevOps.",
  gaps: ["No cloud infrastructure experience"],
  resumeAdvice: ["Add a section on cloud deployments"],
  contextPrompt: null,
  weakMatch: true,
  weakMatchReason: "Missing key infrastructure skills.",
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
      values: {
        matchResult: checkpointedMatchResult,
        atsProfile: {
          atsScore: 84,
          missingKeywords: [],
          layoutFlags: [],
          terminologyGaps: [],
        },
      },
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
    expect(result.matchedSkills).toEqual(["TypeScript"]);
    expect(result.missingSkills).toEqual(["Kubernetes", "Docker"]);
    expect(result.threadId).toBe("thread-123");
    expect(closed).toHaveBeenCalledOnce();
  });

  it("does not include resumeData or jobData in the completed event", async () => {
    const { options, emitted } = buildAcceptOptions();

    await runMatchGraph(options);

    const { result } = (emitted.find((e) => e.event === "completed")!.data) as {
      result: Record<string, unknown>;
    };
    expect(result.resumeData).toBeUndefined();
    expect(result.jobData).toBeUndefined();
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

  it("emits an error event when matchResult is missing from the snapshot", async () => {
    mockGetState.mockResolvedValue({
      values: { matchResult: undefined },
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

  it("includes _meta with traceUrl null and a durationMs in the completed payload", async () => {
    const { options, emitted } = buildAcceptOptions();

    await runMatchGraph(options);

    const { result } = (emitted.find((e) => e.event === "completed")!.data) as {
      result: { _meta: { traceUrl: unknown; durationMs: number } };
    };
    expect(result._meta.traceUrl).toBeNull();
    expect(typeof result._meta.durationMs).toBe("number");
    expect(result._meta.durationMs).toBeGreaterThanOrEqual(0);
  });
});
