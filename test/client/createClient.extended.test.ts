import { describe, expect, it } from "vitest";
import { createBsuirClient } from "../../src";
import { BsuirConfigurationError } from "../../src/client/errors";

describe("createBsuirClient — baseUrl validation (lines 61, 65, 69, 82)", () => {
  it("throws when baseUrl contains credentials (line 61)", () => {
    expect(() => createBsuirClient({ baseUrl: "https://user:pass@iis.bsuir.by/api/v1" })).toThrow(
      BsuirConfigurationError
    );
  });

  it("throws when baseUrl contains query string (line 65)", () => {
    expect(() => createBsuirClient({ baseUrl: "https://iis.bsuir.by/api/v1?foo=bar" })).toThrow(
      BsuirConfigurationError
    );
  });

  it("throws when baseUrl contains hash (line 65)", () => {
    expect(() => createBsuirClient({ baseUrl: "https://iis.bsuir.by/api/v1#section" })).toThrow(
      BsuirConfigurationError
    );
  });

  it("throws when baseUrl uses http:// without allowInsecureHttp (line 69)", () => {
    expect(() =>
      createBsuirClient({
        // eslint-disable-next-line unicorn/prefer-https -- testing insecure HTTP rejection
        baseUrl: "http://iis.bsuir.by/api/v1",
        allowedBaseUrlHosts: ["iis.bsuir.by"]
      })
    ).toThrow(BsuirConfigurationError);
  });

  it("rejects non-loopback http:// even when allowInsecureHttp: true", () => {
    expect(() =>
      createBsuirClient({
        // eslint-disable-next-line unicorn/prefer-https -- testing insecure HTTP rejection
        baseUrl: "http://iis.bsuir.by/api/v1",
        allowInsecureHttp: true,
        allowedBaseUrlHosts: ["iis.bsuir.by"]
      })
    ).toThrow(BsuirConfigurationError);
  });

  it("rejects allowInsecureHttp: true when allowedBaseUrlHosts contains non-loopback hosts", () => {
    expect(() =>
      createBsuirClient({
        baseUrl: "http://localhost/api/v1",
        allowInsecureHttp: true,
        allowedBaseUrlHosts: ["localhost", "iis.bsuir.by"]
      })
    ).toThrow(/loopback/);
  });

  it("throws when allowedBaseUrlHosts contains only blank strings (line 82)", () => {
    expect(() =>
      createBsuirClient({
        baseUrl: "https://iis.bsuir.by/api/v1",
        allowedBaseUrlHosts: ["  ", ""]
      })
    ).toThrow(BsuirConfigurationError);
  });

  it("throws when baseUrl host is not in allowedBaseUrlHosts", () => {
    expect(() =>
      createBsuirClient({
        baseUrl: "https://other.example.com/api/v1",
        allowedBaseUrlHosts: ["iis.bsuir.by"]
      })
    ).toThrow(BsuirConfigurationError);
  });

  it("throws for malformed baseUrl (not a valid URL)", () => {
    expect(() => createBsuirClient({ baseUrl: "not-a-url" })).toThrow(BsuirConfigurationError);
  });
});

describe("createBsuirClient — option validation (line 101)", () => {
  it("throws when retryDelayMs > retryMaxDelayMs (line 101)", () => {
    expect(() => createBsuirClient({ retryDelayMs: 5000, retryMaxDelayMs: 1000 })).toThrow(
      BsuirConfigurationError
    );
  });

  it("throws when timeoutMs exceeds MAX_TIMEOUT_MS", () => {
    expect(() => createBsuirClient({ timeoutMs: 300_001 })).toThrow(BsuirConfigurationError);
  });

  it("throws when timeoutMs is not an integer", () => {
    expect(() => createBsuirClient({ timeoutMs: 1.5 })).toThrow(BsuirConfigurationError);
  });

  it("creates client with custom allowedBaseUrlHosts", () => {
    expect(() =>
      createBsuirClient({
        baseUrl: "https://custom.example.com/api",
        allowedBaseUrlHosts: ["custom.example.com"]
      })
    ).not.toThrow();
  });

  it("accepts hostnames with trailing dot when normalized allowlist matches", () => {
    expect(() =>
      createBsuirClient({
        baseUrl: "https://IIS.BSUIR.BY./api/v1",
        allowedBaseUrlHosts: ["iis.bsuir.by"]
      })
    ).not.toThrow();
  });

  it("rejects baseUrl with explicit port even for allowed host", () => {
    expect(() =>
      createBsuirClient({
        baseUrl: "https://iis.bsuir.by:8443/api/v1",
        allowedBaseUrlHosts: ["iis.bsuir.by"]
      })
    ).toThrow(BsuirConfigurationError);
  });

  it("accepts IPv6 hostname when allowlist uses bracketless form", () => {
    expect(() =>
      createBsuirClient({
        baseUrl: "https://[::1]/api/v1",
        allowedBaseUrlHosts: ["::1"]
      })
    ).not.toThrow();
  });
});
