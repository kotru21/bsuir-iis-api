import { playwright } from "@vitest/browser-playwright";
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["test/browser/**/*.browser.test.ts"],
    browser: {
      enabled: true,
      provider: playwright(),
      // WebKit covers Safari, the oldest engine in the supported browser baseline.
      instances: [{ browser: "chromium" }, { browser: "webkit" }]
    }
  }
});
