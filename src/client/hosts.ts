/** Public IIS host: always HTTPS, even when `allowInsecureHttp` is enabled. */
export const PUBLIC_IIS_HOST = "iis.bsuir.by";

/** Lower-cases, trims trailing dots and strips IPv6 brackets from a hostname. */
export function normalizeHostname(rawHostname: string): string {
  let trimmed = rawHostname.trim().toLowerCase();
  while (trimmed.endsWith(".")) {
    trimmed = trimmed.slice(0, -1);
  }
  if (trimmed.startsWith("[") && trimmed.endsWith("]")) {
    return trimmed.slice(1, -1);
  }
  return trimmed;
}

/** Host rules shared by `baseUrl` validation and redirect checks. */
export interface HostPolicy {
  /** Normalized hostnames the client may talk to. */
  allowedHosts: ReadonlySet<string>;
  /** Whether plain `http:` is acceptable for allowed hosts other than the public IIS host. */
  allowInsecureHttp: boolean;
}

/**
 * Why `url` may not be used under `policy`, or `null` when it is fine.
 * The explanation is phrased to be embedded in an error message.
 */
export function describeHostViolation(url: URL, policy: HostPolicy): string | null {
  const host = normalizeHostname(url.hostname);
  if (!policy.allowedHosts.has(host)) {
    return `host '${host}' is not in allowedBaseUrlHosts (${[...policy.allowedHosts].join(", ")})`;
  }
  if (url.protocol === "https:") {
    return null;
  }
  if (url.protocol !== "http:") {
    return `protocol '${url.protocol}' is not supported`;
  }
  if (!policy.allowInsecureHttp) {
    return "plain HTTP requires 'allowInsecureHttp: true'";
  }
  if (host === PUBLIC_IIS_HOST) {
    return `the public IIS host '${PUBLIC_IIS_HOST}' is only reachable over HTTPS`;
  }
  return null;
}
