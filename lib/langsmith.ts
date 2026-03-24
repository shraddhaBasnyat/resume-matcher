import { BaseCallbackHandler } from "@langchain/core/callbacks/base";
import type { Serialized } from "@langchain/core/load/serializable";
import { z } from "zod";
import { Client } from "langsmith";

export function isTracingEnabled(): boolean {
  return process.env.LANGCHAIN_TRACING_V2 === "true";
}

export function getTraceUrl(runId: string): string {
  return `https://smith.langchain.com/public/${runId}/r`;
}

/** Run name constants — used as the `runName` in graph invoke configs. */
export const RUN_NAMES = {
  COMPLETED: "resume-match-graph: completed",
  CANCELLED: "resume-match-graph: cancelled-by-human",
  HITL_RESUMED: "resume-match-graph: hitl-resumed",
  FAILED: "resume-match-graph: failed",
} as const;

/**
 * Logs a Zod validation failure to LangSmith by updating the run with error details.
 * No-ops when tracing is disabled or runId is unavailable.
 */
export async function logValidationFailure({
  runId,
  nodeName,
  errors,
  rawOutput,
}: {
  runId?: string;
  nodeName: string;
  errors: z.ZodError;
  rawOutput: unknown;
}): Promise<void> {
  if (!isTracingEnabled() || !runId) return;

  const client = new Client();
  await client.updateRun(runId, {
    extra: {
      validationFailed: true,
      nodeName,
      validationErrors: errors.flatten(),
      rawOutput,
    },
    tags: ["validation-failed", nodeName],
  });
}

/**
 * Callback handler that captures the root run ID from a LangChain invocation.
 * Attach via `callbacks: [new RootRunCapture()]` in the invoke config.
 * After the run completes, read `capture.rootRunId`.
 */
export class RootRunCapture extends BaseCallbackHandler {
  name = "root_run_capture";
  rootRunId: string | undefined;
  private readonly onCapture?: (runId: string) => void;

  constructor(onCapture?: (runId: string) => void) {
    super();
    this.onCapture = onCapture;
  }

  handleChainStart(
    _chain: Serialized,
    _inputs: Record<string, unknown>,
    runId: string,
    parentRunId?: string
  ): void {
    if (!parentRunId && !this.rootRunId) {
      this.rootRunId = runId;
      this.onCapture?.(runId);
    }
  }
}
