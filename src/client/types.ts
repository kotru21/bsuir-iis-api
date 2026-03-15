export type QueryValue = string | number | boolean | null | undefined;

export type QueryParams = Record<string, QueryValue>;

export interface RequestOptions {
  query?: QueryParams | undefined;
  signal?: AbortSignal | undefined;
}

export interface BsuirClientOptions {
  baseUrl?: string;
  fetch?: typeof globalThis.fetch;
  timeoutMs?: number;
  retries?: number;
  retryDelayMs?: number;
  userAgent?: string;
  defaultRaw?: boolean;
}

export interface InternalClientConfig {
  baseUrl: string;
  fetchImpl: typeof globalThis.fetch;
  timeoutMs: number;
  retries: number;
  retryDelayMs: number;
  userAgent: string | undefined;
  defaultRaw: boolean;
}
