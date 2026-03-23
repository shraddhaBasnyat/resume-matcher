import { BaseCallbackHandler } from "@langchain/core/callbacks/base";
import type { Serialized } from "@langchain/core/load/serializable";

export function isTracingEnabled(): boolean {
  return process.env.LANGCHAIN_TRACING_V2 === "true";
}

export function getTraceUrl(runId: string): string {
  return `https://smith.langchain.com/public/${runId}/r`;
}

/**
 * Callback handler that captures the root run ID from a LangChain invocation.
 * Attach via `callbacks: [new RootRunCapture()]` in the invoke config.
 * After the run completes, read `capture.rootRunId`.
 */
export class RootRunCapture extends BaseCallbackHandler {
  name = "root_run_capture";
  rootRunId: string | undefined;

  handleChainStart(
    _chain: Serialized,
    _inputs: Record<string, unknown>,
    runId: string,
    parentRunId?: string
  ): void {
    if (!parentRunId && !this.rootRunId) {
      this.rootRunId = runId;
    }
  }
}
