/**
 * Invokes a lifecycle hook, swallowing any exception it throws.
 *
 * Hooks are observability callbacks: a throwing hook must never break the
 * request, trigger a retry of an already-finished exchange, or mask the real
 * outcome (same precedent as the `onInvalidTime` hook in schedule helpers).
 * Without this isolation a misbehaving logger/metrics callback would be caught
 * by the request pipeline's generic `catch` and misclassified as a network
 * error.
 */
export function invokeHookSafely<TContext>(
  hook: ((context: TContext) => void) | undefined,
  context: TContext
): void {
  if (!hook) {
    return;
  }
  try {
    hook(context);
  } catch {
    // Observability must not affect the request pipeline.
  }
}
