type AbortSignalConstructor = typeof AbortSignal & {
  any?(signals: AbortSignal[]): AbortSignal;
};

const AbortSignalCtor = AbortSignal as AbortSignalConstructor;

/**
 * Combines an optional caller {@link AbortSignal} with a per-attempt timeout.
 * When `AbortSignal.any` exists at runtime, delegates to the platform implementation.
 * Otherwise uses a manual merge so the timeout still applies alongside a caller signal.
 */
export function mergeSignals(signal: AbortSignal | undefined, timeoutMs: number): AbortSignal {
  if (typeof AbortSignalCtor.any === "function") {
    const parts: AbortSignal[] = [AbortSignal.timeout(timeoutMs)];
    if (signal) {
      parts.push(signal);
    }
    return AbortSignalCtor.any(parts);
  }

  return mergeSignalsManual(signal, timeoutMs);
}
/** Used when `AbortSignal.any` is unavailable; exposed for unit tests. */
export function mergeSignalsManual(signal: AbortSignal | undefined, timeoutMs: number): AbortSignal {
  const combined = new AbortController();

  // Store listeners and timeout for cleanup
  const listeners: { signal: AbortSignal; handler: () => void }[] = [];
  const timeoutId = setTimeout(() => {
    if (!combined.signal.aborted) {
      combined.abort();
    }
  }, timeoutMs);

  const onSignalAbort = (): void => {
    clearTimeout(timeoutId);
    combined.abort();
  };

  if (signal) {
    if (signal.aborted) {
      clearTimeout(timeoutId);
      combined.abort();
    } else {
      signal.addEventListener("abort", onSignalAbort, { once: true });
      listeners.push({ signal, handler: onSignalAbort });
    }
  }

  // Cleanup function to prevent memory leaks (stored for external cleanup if needed)
  const cleanup = (): void => {
    clearTimeout(timeoutId);
    for (const listener of listeners) {
      listener.signal.removeEventListener("abort", listener.handler);
    }
  };

  // Attach cleanup to signal's abort event to ensure cleanup happens
  combined.signal.addEventListener("abort", cleanup, { once: true });

  return combined.signal;
}
