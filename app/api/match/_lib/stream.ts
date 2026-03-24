export interface SSEStream {
  stream: ReadableStream<Uint8Array>;
  emit: (eventName: string, data: object) => void;
  close: () => void;
}

export function createSSEStream(): SSEStream {
  const encoder = new TextEncoder();
  // controller is assigned synchronously in ReadableStream start callback
  // eslint-disable-next-line prefer-const
  let controller!: ReadableStreamDefaultController<Uint8Array>;

  const stream = new ReadableStream<Uint8Array>({
    start(ctrl) {
      controller = ctrl;
    },
  });

  function emit(eventName: string, data: object): void {
    try {
      controller.enqueue(
        encoder.encode(`event: ${eventName}\ndata: ${JSON.stringify(data)}\n\n`)
      );
    } catch {
      // Stream may already be closed
    }
  }

  function close(): void {
    try {
      controller.close();
    } catch {
      // already closed
    }
  }

  return { stream, emit, close };
}
