import { describe } from "vitest";

export const runLiveTests = process.env.BSUIR_LIVE_TESTS === "1";

/** Use instead of `describe` in every live suite — skips when gate is off. */
export const describeLive = runLiveTests ? describe : describe.skip;
