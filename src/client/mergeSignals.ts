type AbortSignalConstructor = typeof AbortSignal & {
  any?(signals: AbortSignal[]): AbortSignal;
};

const AbortSignalCtor = AbortSignal as AbortSignalConstructor;

/**
 * Combines multiple abort signals and/or a timeout into a single signal.
 * When `AbortSignal.any` exists at runtime, delegates to the platform implementation.
 * Otherwise uses a manual merge so all signals are respected.
 *
 * @param signalsOrFirst - Array of signals to merge, or (legacy) a single signal
 * @param timeoutMs - (Legacy) timeout in milliseconds; ignored if first arg is an array
 */
export function mergeSignals(
  signalsOrFirst: AbortSignal[] | (AbortSignal | undefined),
  timeoutMs?: number
): AbortSignal {
  // Handle both signatures for backwards compatibility
  let signals: (AbortSignal | undefined)[];
  let timeout: number | undefined;

  if (Array.isArray(signalsOrFirst)) {
    signals = signalsOrFirst;
    timeout = timeoutMs;
  } else {
    // Legacy signature: mergeSignals(signal, timeoutMs)
    signals = [signalsOrFirst];
    timeout = timeoutMs;
  }

  const parts = signals.filter((s): s is AbortSignal => s !== undefined);

  if (parts.length === 0) {
    // No signals to merge
    if (timeout !== undefined) {
      // Only a timeout, no external signal
      if (typeof AbortSignalCtor.any === "function") {
        return AbortSignalCtor.any([AbortSignal.timeout(timeout)]);
      }
      return mergeSignalsManual([], timeout);
    }
    // No signals and no timeout; return a never-aborted signal
    return new AbortController().signal;
  }

  if (parts.length === 1 && timeout === undefined) {
    // Single signal, no timeout; parts is narrowed to non-empty by length check
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    return parts[0]!;
  }

  if (typeof AbortSignalCtor.any === "function" && timeout !== undefined) {
    // Use platform AbortSignal.any with timeout
    return AbortSignalCtor.any([...parts, AbortSignal.timeout(timeout)]);
  }

  if (typeof AbortSignalCtor.any === "function" && parts.length > 1) {
    // Multiple signals, no timeout
    return AbortSignalCtor.any(parts);
  }

  // Fallback: use manual merge with possible timeout
  return mergeSignalsManual(parts, timeout);
}
/** Used when `AbortSignal.any` is unavailable; exposed for unit tests. */
export function mergeSignalsManual(signals: AbortSignal[], timeoutMs?: number): AbortSignal {
  if (signals.length === 0 && timeoutMs === undefined) {
    return new AbortController().signal;
  }
  if (signals.length === 1 && timeoutMs === undefined) {
    // Single signal, no timeout; signals is narrowed to non-empty by length check
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
