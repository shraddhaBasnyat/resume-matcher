import { BaseCallbackHandler } from "@langchain/core/callbacks/base";
import type { Serialized } from "@langchain/core/load/serializable";

/** Node names that should trigger progress events in the SSE stream. */
const GRAPH_NODES = new Set([
  "atsAnalysis",
  "analyzeFit",
  "routeVerdicts",
  "analyzeStrongMatch",
  "analyzeNarrativeGap",
  "analyzeSkepticalReconciliation",
]);

/** Callback handler that emits SSE node_start / node_done events. */
export class NodeProgressEmitter extends BaseCallbackHandler {
  name = "node_progress_emitter";
  private nodeRuns = new Map<string, { name: string; startTime: number }>();

  constructor(private readonly emit: (eventName: string, data: object) => void) {
    super();
  }

  handleChainStart(
    _chain: Serialized,
    _inputs: Record<string, unknown>,
    runId: string,
    _parentRunId?: string,
    _tags?: string[],
    _metadata?: Record<string, unknown>,
    _runType?: string,
    name?: string
  ): void {
    if (!name || !GRAPH_NODES.has(name)) return;
    const ts = Date.now();
    this.nodeRuns.set(runId, { name, startTime: ts });
    this.emit("node_start", { node: name, timestamp: ts });
  }

  handleChainEnd(
    _outputs: Record<string, unknown>,
    runId: string
  ): void {
    const run = this.nodeRuns.get(runId);
    if (!run) return;
    const ts = Date.now();
    this.emit("node_done", { node: run.name, durationMs: ts - run.startTime, timestamp: ts });
    this.nodeRuns.delete(runId);
  }

  handleChainError(
    _error: Error,
    runId: string
  ): void {
    this.nodeRuns.delete(runId);
  }
}
