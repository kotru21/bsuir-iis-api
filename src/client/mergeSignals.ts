type AbortSignalConstructor = typeof AbortSignal & {
  any?(signals: AbortSignal[]): AbortSignal;
};

const AbortSignalCtor = AbortSignal as AbortSignalConstructor;

// Use a WeakMap to associate merged signals with their cleanup callbacks instead
// of attaching properties to the signal object.
const mergedSignalCleanupMap = new WeakMap<AbortSignal, () => void>();

function getOnlySignal(signals: readonly AbortSignal[]): AbortSignal {
  const signal = signals[0];
  if (signal === undefined) {
    throw new Error("Expected at least one abort signal");
  }
  return signal;
}

/**
 * Returns a cleanup callback for manually merged signals, when available.
 */
export function getMergedSignalCleanup(signal: AbortSignal): (() => void) | undefined {
  return mergedSignalCleanupMap.get(signal);
}

/**
 * Combines `parts` with a clearable timeout via platform `AbortSignal.any`,
 * registering cleanup on the combined signal (same WeakMap contract as
 * {@link mergeSignalsManual}). Falls back to manual merge if `any` is missing.
 */
function mergeWithTimeout(parts: AbortSignal[], timeoutMs: number): AbortSignal {
  if (typeof AbortSignalCtor.any !== "function") {
    return mergeSignalsManual(parts, timeoutMs);
  }

  const timeoutController = new AbortController();
  let cleanedUp = false;
  const timeoutId = setTimeout(() => {
    if (!timeoutController.signal.aborted) {
      timeoutController.abort();
    }
  }, timeoutMs);
  const combined = AbortSignalCtor.any([...parts, timeoutController.signal]);
  const cleanup = (): void => {
    if (cleanedUp) {
      return;
    }
    cleanedUp = true;
    clearTimeout(timeoutId);
    mergedSignalCleanupMap.delete(combined);
  };
  mergedSignalCleanupMap.set(combined, cleanup);
  return combined;
}

/**
 * Combines multiple abort signals and/or a timeout into a single signal.
 * When `AbortSignal.any` exists at runtime, delegates to the platform implementation.
 * Otherwise uses a manual merge so all signals are respected.
 *
 * Timeout timers are always clearable via {@link getMergedSignalCleanup} —
 * including on the `AbortSignal.any` path (uses a local `setTimeout` instead of
 * uncancellable `AbortSignal.timeout`).
 */
export function mergeSignals(
  signals: readonly (AbortSignal | undefined)[],
  timeoutMs?: number
): AbortSignal {
  const parts = signals.filter((s): s is AbortSignal => s !== undefined);

  if (parts.length === 0) {
    if (timeoutMs !== undefined) {
      return mergeWithTimeout([], timeoutMs);
    }
    return new AbortController().signal;
  }

  if (timeoutMs === undefined && parts.length === 1) {
    return getOnlySignal(parts);
  }

  if (timeoutMs !== undefined) {
    return mergeWithTimeout(parts, timeoutMs);
  }

  if (typeof AbortSignalCtor.any === "function") {
    return AbortSignalCtor.any(parts);
  }

  return mergeSignalsManual(parts);
}

/** Used when `AbortSignal.any` is unavailable; exposed for unit tests. */
export function mergeSignalsManual(signals: AbortSignal[], timeoutMs?: number): AbortSignal {
  if (timeoutMs === undefined && signals.length === 0) {
    return new AbortController().signal;
  }
  if (timeoutMs === undefined && signals.length === 1) {
    return getOnlySignal(signals);
  }

  const combined = new AbortController();
  const listeners: { signal: AbortSignal; handler: () => void }[] = [];
  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  let cleanedUp = false;

  const onAnyAbort = (): void => {
    if (combined.signal.aborted) {
      return;
    }

    if (timeoutId !== undefined) {
      clearTimeout(timeoutId);
      timeoutId = undefined;
    }
    combined.abort();
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
