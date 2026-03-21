/**
 * Combines an optional caller {@link AbortSignal} with a per-attempt timeout.
 * When {@link AbortSignal.any} exists, delegates to the platform implementation.
 * Otherwise uses a manual merge so the timeout still applies alongside a caller signal.
 */
export function mergeSignals(signal: AbortSignal | undefined, timeoutMs: number): AbortSignal {
  if (typeof AbortSignal.any === "function") {
    const parts: AbortSignal[] = [AbortSignal.timeout(timeoutMs)];
    if (signal) {
      parts.push(signal);
    }
    return AbortSignal.any(parts);
  }

  return mergeSignalsManual(signal, timeoutMs);
}

/** Used when `AbortSignal.any` is unavailable; exposed for unit tests. */
export function mergeSignalsManual(signal: AbortSignal | undefined, timeoutMs: number): AbortSignal {
  const combined = new AbortController();

  const onSignalAbort = (): void => {
    clearTimeout(timeoutId);
    combined.abort();
  };

  const timeoutId = setTimeout(() => {
    if (signal) {
      signal.removeEventListener("abort", onSignalAbort);
    }
    combined.abort();
  }, timeoutMs);

  if (signal) {
    if (signal.aborted) {
      clearTimeout(timeoutId);
      combined.abort();
    } else {
      signal.addEventListener("abort", onSignalAbort, { once: true });
    }
  }

  return combined.signal;
}
