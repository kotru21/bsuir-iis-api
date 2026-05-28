import { describe, expect, it, vi } from "vitest";
import { BsuirApiError, BsuirConfigurationError } from "../../src/client/errors";

describe("error classes", () => {
  it("does not call Object.setPrototypeOf for Error subclasses", () => {
    const spy = vi.spyOn(Object, "setPrototypeOf");
    try {
      new BsuirApiError("oops", 500, "endpoint", {});
      new BsuirConfigurationError("bad config");
      expect(spy).not.toHaveBeenCalled();
    } finally {
      spy.mockRestore();
    }
  });
});
