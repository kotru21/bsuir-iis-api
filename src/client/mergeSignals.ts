type AbortSignalConstructor = typeof AbortSignal & {
  any?(signals: AbortSignal[]): AbortSignal;
};

const AbortSignalCtor = AbortSignal as AbortSignalConstructor;

/**
 * Combines multiple abort signals and/or a timeout into a single signal.
 * When `AbortSignal.any` exists at runtime, delegates to the platform implementation.
 * Otherwise uses a manual merge so all signals are respected.
 *
 * @param signals - Signals to merge
 * @param timeoutMs - Optional timeout in milliseconds to include as an additional signal
 *
 * @remarks
 * Calling with no signals and no timeout (e.g. `mergeSignals([])`) returns a signal
 * that is never aborted — the caller is responsible for not doing this intentionally.
 */
export function mergeSignals(
  signals: readonly (AbortSignal | undefined)[],
  timeoutMs?: number
): AbortSignal {
  const parts = signals.filter((s): s is AbortSignal => s !== undefined);

  if (parts.length === 0) {
    if (timeoutMs !== undefined) {
      // Only a timeout, no external signal
      if (typeof AbortSignalCtor.any === "function") {
        return AbortSignalCtor.any([AbortSignal.timeout(timeoutMs)]);
      }
      return mergeSignalsManual([], timeoutMs);
    }
    // No signals and no timeout — returns a signal that is never aborted.
    // This is a degenerate case; callers should avoid it.
    return new AbortController().signal;
  }

  if (parts.length === 1 && timeoutMs === undefined) {
    // Single signal, no timeout — return it directly
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    return parts[0]!;
  }

  // Use platform AbortSignal.any when available (covers both timeout and multi-signal cases)
  if (typeof AbortSignalCtor.any === "function") {
    const all = timeoutMs === undefined ? parts : [...parts, AbortSignal.timeout(timeoutMs)];
    return AbortSignalCtor.any(all);
  }

  // Fallback: manual merge with possible timeout
  return mergeSignalsManual(parts, timeoutMs);
}

/** Used when `AbortSignal.any` is unavailable; exposed for unit tests. */
export function mergeSignalsManual(signals: AbortSignal[], timeoutMs?: number): AbortSignal {
  if (signals.length === 0 && timeoutMs === undefined) {
    return new AbortController().signal;
  }
  if (signals.length === 1 && timeoutMs === undefined) {
    // Single signal, no timeout
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    return signals[0]!;
  }

  const combined = new AbortController();
  const listeners: { signal: AbortSignal; handler: () => void }[] = [];
  let timeoutId: ReturnType<typeof setTimeout> | undefined;

  const onAnyAbort = (): void => {
    if (!combined.signal.aborted) {
      if (timeoutId !== undefined) {
        clearTimeout(timeoutId);
      }
      combined.abort();
    }
  };

  // Setup timeout if provided
  if (timeoutMs !== undefined) {
    timeoutId = setTimeout(() => {
      if (!combined.signal.aborted) {
        combined.abort();
      }
    }, timeoutMs);
  }

  // Setup listeners for external signals
  for (const signal of signals) {
    if (signal.aborted) {
      onAnyAbort();
      break;
    } else {
      signal.addEventListener("abort", onAnyAbort, { once: true });
      listeners.push({ signal, handler: onAnyAbort });
    }
  }

  // Cleanup listeners and timeout when combined signal aborts to prevent memory leaks
  combined.signal.addEventListener(
    "abort",
    () => {
      if (timeoutId !== undefined) {
        clearTimeout(timeoutId);
      }
      for (const listener of listeners) {
        listener.signal.removeEventListener("abort", listener.handler);
      }
    },
    { once: true }
  );

  return combined.signal;
}
