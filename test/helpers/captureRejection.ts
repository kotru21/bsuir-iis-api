/** Awaits `promise` and returns its rejection reason; fails the test if it resolves. */
export async function captureRejection(promise: Promise<unknown>): Promise<unknown> {
  try {
    await promise;
  } catch (error_: unknown) {
    return error_;
  }
  throw new Error("Expected the promise to reject, but it resolved");
}
