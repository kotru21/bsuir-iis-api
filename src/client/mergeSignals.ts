type AbortSignalConstructor = typeof AbortSignal & {
  any?(signals: AbortSignal[]): AbortSignal;
};

const AbortSignalCtor = AbortSignal as AbortSignalConstructor;

// Use a WeakMap to associate merged signals with their cleanup callbacks instead
// of attaching properties to the signal object.
const mergedSignalCleanupMap = new WeakMap<AbortSignal, () => void>();

/**
 * Returns a cleanup callback for manually merged signals, when available.
 */
export function getMergedSignalCleanup(signal: AbortSignal): (() => void) | undefined {
  return mergedSignalCleanupMap.get(signal);
}

/**
 * Combines multiple abort signals and/or a timeout into a single signal.
 * When `AbortSignal.any` exists at runtime, delegates to the platform implementation.
 * Otherwise uses a manual merge so all signals are respected.
 */
export function mergeSignals(
  signals: readonly (AbortSignal | undefined)[],
  timeoutMs?: number
): AbortSignal {
  const parts = signals.filter((s): s is AbortSignal => s !== undefined);

  if (parts.length === 0) {
    if (timeoutMs !== undefined) {
      if (typeof AbortSignalCtor.any === "function") {
        return AbortSignalCtor.any([AbortSignal.timeout(timeoutMs)]);
      }
      return mergeSignalsManual([], timeoutMs);
    }
    return new AbortController().signal;
  }

  if (parts.length === 1 && timeoutMs === undefined) {
    return parts[0]!;
  }

  if (typeof AbortSignalCtor.any === "function") {
    const all = timeoutMs === undefined ? parts : [...parts, AbortSignal.timeout(timeoutMs)];
    return AbortSignalCtor.any(all);
  }

  return mergeSignalsManual(parts, timeoutMs);
}

/** Used when `AbortSignal.any` is unavailable; exposed for unit tests. */
export function mergeSignalsManual(signals: AbortSignal[], timeoutMs?: number): AbortSignal {
  if (signals.length === 0 && timeoutMs === undefined) {
    return new AbortController().signal;
  }
  if (signals.length === 1 && timeoutMs === undefined) {
    return signals[0]!;
  }

  const combined = new AbortController();
  const listeners: { signal: AbortSignal; handler: () => void }[] = [];
  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  let cleanedUp = false;

  const onAnyAbort = (): void => {
    if (!combined.signal.aborted) {
      if (timeoutId !== undefined) {
        clearTimeout(timeoutId);
        timeoutId = undefined;
      }
      combined.abort();
    }
  };

  const cleanup = (): void => {
    if (cleanedUp) {
      return;
    }
    cleanedUp = true;
    if (timeoutId !== undefined) {
      clearTimeout(timeoutId);
      timeoutId = undefined;
    }
    for (const listener of listeners) {
      listener.signal.removeEventListener("abort", listener.handler);
    }
    listeners.length = 0;
    combined.signal.removeEventListener("abort", cleanup);
    mergedSignalCleanupMap.delete(combined.signal);
  };

  // Register cleanup before possibly synchronous abort path below.
  combined.signal.addEventListener("abort", cleanup, { once: true });
  mergedSignalCleanupMap.set(combined.signal, cleanup);

  if (timeoutMs !== undefined) {
    timeoutId = setTimeout(() => {
      if (!combined.signal.aborted) {
        combined.abort();
      }
    }, timeoutMs);
  }

  for (const signal of signals) {
    if (signal.aborted) {
      onAnyAbort();
      break;
    }
    const record = { signal, handler: onAnyAbort };
    listeners.push(record);
    signal.addEventListener("abort", onAnyAbort, { once: true });
  }

  return combined.signal;
}
