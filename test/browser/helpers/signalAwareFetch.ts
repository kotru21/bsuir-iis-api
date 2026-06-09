/**
 * Fetch stub that rejects when the request AbortSignal fires — same contract as browser fetch.
 */
export function createSignalAwareFetch(
  onAbort?: (signal: AbortSignal) => void
): typeof fetch {
  return (async (_input, init) => {
    const signal = init?.signal;
    if (!signal) {
      throw new Error("expected AbortSignal on request init");
    }
    if (signal.aborted) {
      const reason = signal.reason;
      if (reason instanceof DOMException) {
        throw reason;
      }
      throw new DOMException("The operation was aborted", "AbortError");
    }
    await new Promise<never>((_resolve, reject) => {
      const onAbortEvent = (): void => {
        onAbort?.(signal);
        const reason = signal.reason;
        if (reason instanceof DOMException) {
          reject(reason);
          return;
        }
        reject(new DOMException("The operation was aborted", "AbortError"));
      };
      signal.addEventListener("abort", onAbortEvent, { once: true });
    });
    return new Response(JSON.stringify([]), {
      status: 200,
      headers: { "content-type": "application/json" }
    });
  }) as typeof fetch;
}
