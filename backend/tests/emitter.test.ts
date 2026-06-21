import { describe, it, expect, vi } from "vitest";
import { NodeProgressEmitter } from "../src/infra/emitter.js";

// ---------------------------------------------------------------------------
// NodeProgressEmitter — node_done payload
// ---------------------------------------------------------------------------

describe("NodeProgressEmitter — node_done aha field", () => {
  function makeEmitter() {
    const emitted: { eventName: string; data: object }[] = [];
    const emit = (eventName: string, data: object) => emitted.push({ eventName, data });
    const emitter = new NodeProgressEmitter(emit);
    return { emitter, emitted };
  }

  function startNode(emitter: NodeProgressEmitter, name: string): string {
    const runId = `run-${name}`;
    emitter.handleChainStart(
      {} as never,
      {},
      runId,
      undefined,
      undefined,
      undefined,
      undefined,
      name,
    );
    return runId;
  }

  it("includes aha when fitAha is present in outputs (analyzeFit)", () => {
    const { emitter, emitted } = makeEmitter();
    const runId = startNode(emitter, "analyzeFit");

    emitter.handleChainEnd({ fitAha: "Sharp fit observation here." }, runId);

    const done = emitted.find((e) => e.eventName === "node_done");
    expect(done).toBeDefined();
    expect((done!.data as Record<string, unknown>).aha).toBe("Sharp fit observation here.");
  });

  it("includes aha when resumeAha is present in outputs (analyzeResume)", () => {
    const { emitter, emitted } = makeEmitter();
    const runId = startNode(emitter, "analyzeResume");

    emitter.handleChainEnd({ resumeAha: "Sharp resume-only observation here." }, runId);

    const done = emitted.find((e) => e.eventName === "node_done");
    expect((done!.data as Record<string, unknown>).aha).toBe("Sharp resume-only observation here.");
  });

  it("includes aha when verdictAha is present in outputs (verdict node)", () => {
    const { emitter, emitted } = makeEmitter();
    const runId = startNode(emitter, "analyzeNarrativeGap");

    emitter.handleChainEnd({ verdictAha: "Verdict observation here." }, runId);

    const done = emitted.find((e) => e.eventName === "node_done");
    expect((done!.data as Record<string, unknown>).aha).toBe("Verdict observation here.");
  });

  it("omits aha key entirely when no aha field is present — key must not be emitted as undefined", () => {
    const { emitter, emitted } = makeEmitter();
    const runId = startNode(emitter, "routeVerdicts");

    emitter.handleChainEnd(
      { scenarioId: "narrative_gap", fitScore: 62, atsScore: 45 },
      runId,
    );

    const done = emitted.find((e) => e.eventName === "node_done");
    expect(done).toBeDefined();
    expect("aha" in done!.data).toBe(false);
  });

  it("routeVerdicts node_done carries fitScore, atsScore, scenarioId — no aha", () => {
    const { emitter, emitted } = makeEmitter();
    const runId = startNode(emitter, "routeVerdicts");

    emitter.handleChainEnd(
      { scenarioId: "confirmed_fit", fitScore: 88, atsScore: 80 },
      runId,
    );

    const done = emitted.find((e) => e.eventName === "node_done");
    const data = done!.data as Record<string, unknown>;
    expect(data.scenarioId).toBe("confirmed_fit");
    expect(data.fitScore).toBe(88);
    expect(data.atsScore).toBe(80);
    expect("aha" in data).toBe(false);
  });

  it("omits fitScore/atsScore/scenarioId when absent from outputs", () => {
    const { emitter, emitted } = makeEmitter();
    const runId = startNode(emitter, "analyzeFit");

    emitter.handleChainEnd({ fitAha: "Some aha." }, runId);

    const done = emitted.find((e) => e.eventName === "node_done");
    const data = done!.data as Record<string, unknown>;
    expect("fitScore" in data).toBe(false);
    expect("atsScore" in data).toBe(false);
    expect("scenarioId" in data).toBe(false);
  });

  it("ignores handleChainEnd for unknown runIds", () => {
    const { emitter, emitted } = makeEmitter();
    emitter.handleChainEnd({ fitAha: "Should not emit." }, "unknown-run-id");
    const done = emitted.find((e) => e.eventName === "node_done");
    expect(done).toBeUndefined();
  });
});
