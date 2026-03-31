import type { Request, Response } from "express";

export interface SSEStream {
  emit: (eventName: string, data: object) => void;
  close: () => void;
}

export function createSSEStream(res: Response): SSEStream {
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.flushHeaders();

  function emit(eventName: string, data: object): void {
    try {
      res.write(`event: ${eventName}\ndata: ${JSON.stringify(data)}\n\n`);
    } catch {
      // Client may have disconnected
    }
  }

  function close(): void {
    try {
      res.end();
    } catch {
      // already ended
    }
  }

  return { emit, close };
}

export function handleClientDisconnect(
  req: Request,
  res: Response,
  abortController: AbortController
): void {
  res.on("close", () => {
    if (!res.writableEnded) {
      abortController.abort();
    }
  });
}
