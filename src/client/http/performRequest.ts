import {
  BsuirApiError,
  BsuirConfigurationError,
  BsuirNetworkError,
  BsuirResponsePayloadTooLargeError,
  BsuirResponseValidationError,
  BsuirTimeoutError
} from "../errors";
import { getMergedSignalCleanup, mergeSignals } from "../mergeSignals";
import { invokeHookSafely } from "./hooks";
import type {
  ErrorHookContext,
  InternalClientConfig,
  QueryParams,
  RequestHookContext,
  RequestOptions,
  RetryHookContext
} from "../types";
import { isAbortError } from "../../utils/guards";
import { cancelResponseBody, parseBody } from "./response";
import {
  getRetryDecision,
  getRetryDelayMs,
  parseRetryAfterMs,
  RETRIABLE_STATUS_CODES,
  sleep
} from "./retry";
import { describeHostViolation, type HostPolicy } from "../hosts";

const MAX_ERROR_BODY_IN_MESSAGE = 300;

/** One-line, length-capped preview of a text error body; the full body stays in `error.body`. */
function summarizeErrorBody(body: string): string {
  const compact = body.replaceAll(/\s+/g, " ").trim();
  if (compact.length <= MAX_ERROR_BODY_IN_MESSAGE) {
    return compact;
  }
  return `${compact.slice(0, MAX_ERROR_BODY_IN_MESSAGE)}… (${String(compact.length)} chars)`;
}

/**
 * `fetch` follows redirects on its own, so the `baseUrl` host policy would be moot if a
 * redirect could land anywhere. Rejects (and releases) a response whose final URL is
 * outside the policy. Mock/custom `fetch` responses without `redirected` pass through.
 */
async function assertRedirectAllowed(
  response: Response,
  policy: HostPolicy,
  path: string
): Promise<void> {
  if (!response.redirected) {
    return;
  }
  let finalUrl: URL;
  try {
    // Not `URL.canParse`: it is newer than the supported browser baseline.
    finalUrl = new URL(response.url);
  } catch {
    return;
  }
  const violation = describeHostViolation(finalUrl, policy);
  if (violation === null) {
    return;
  }
  await cancelResponseBody(response);
  throw new BsuirConfigurationError(
    `Request to ${path} was redirected to ${finalUrl.origin}, which is not allowed: ${violation}`
  );
}

/** Builds the hook context shared by all lifecycle events of a single attempt. */
export function baseHookContext(
  path: string,
  endpoint: string,
  attempt: number,
  maxAttempts: number,
  query: QueryParams | undefined
): RequestHookContext {
  return {
    method: "GET",
    path,
    endpoint,
    attempt,
    maxAttempts,
    query
  };
}

/** Parameters for a single HTTP attempt inside the request pipeline. */
export interface PerformRequestParams {
  config: Readonly<InternalClientConfig>;
  path: string;
  endpoint: string;
  headers: Headers;
  options: RequestOptions;
  maxRetries: number;
  maxAttempts: number;
}

/** Parsed 2xx body plus what the caller needs to report it to `onResponse`. */
export interface PerformRequestResult<T> {
  payload: T;
  /** Context of the attempt that succeeded. */
  hookCtx: RequestHookContext;
  durationMs: number;
  status: number;
}

/**
 * Executes a single HTTP request with retry/backoff and lifecycle hooks.
 *
 * Fires `onRequest` / `onRetry` / `onError`, but not `onResponse`: the caller reports
 * success only after its `responseValidator` accepted the payload, so a rejected body
 * ends with `onError` alone (one terminal event per call).
 */
export async function performRequestWithRetry<T>(
  params: PerformRequestParams
): Promise<PerformRequestResult<T>> {
  const { config, path, endpoint, headers, options, maxRetries, maxAttempts } = params;

  let previousAttempt: { hookCtx: RequestHookContext; startedAt: number } | undefined;

  for (let attempt = 0; attempt <= maxRetries; attempt += 1) {
    // Backoff sleep ends early on caller cancellation; stop here instead of announcing
    // an attempt that would only fail on the already-aborted signal.
    const cancelledBy = previousAttempt
      ? [options.signal, config.signal].find((signal) => signal?.aborted === true)
      : undefined;
    if (previousAttempt && cancelledBy) {
      const reason: unknown = cancelledBy.reason;
      invokeHookSafely(config.hooks.onError, {
        ...previousAttempt.hookCtx,
        durationMs: Date.now() - previousAttempt.startedAt,
        error: reason,
        deduplicated: false
      });
      throw reason;
    }

    const attemptNumber = attempt + 1;
    const startedAt = Date.now();
    const hookCtx = baseHookContext(path, endpoint, attemptNumber, maxAttempts, options.query);
    previousAttempt = { hookCtx, startedAt };

    invokeHookSafely(config.hooks.onRequest, hookCtx);

    const requestSignal = mergeSignals([options.signal, config.signal], config.timeoutMs);
    const requestSignalCleanup = getMergedSignalCleanup(requestSignal);

    try {
      const response = await config.fetchImpl(endpoint, {
        method: "GET",
        headers,
        signal: requestSignal
      });
      await assertRedirectAllowed(response, config.hostPolicy, path);

      if (!response.ok) {
        // Retries are decided before the error body is read: a retriable response
        // does not need its body parsed, and an oversized error page must not
        // disable retries by surfacing BsuirResponsePayloadTooLargeError instead.
        if (attempt < maxRetries && RETRIABLE_STATUS_CODES.has(response.status)) {
          const retryDecision = getRetryDecision(
            config,
            attempt,
            response.headers.get("retry-after")
          );
          if (retryDecision.retryable) {
            const retryCtx: RetryHookContext = {
              ...hookCtx,
              delayMs: retryDecision.delayMs,
              reason: "http_status",
              status: response.status
            };
            invokeHookSafely(config.hooks.onRetry, retryCtx);
            await cancelResponseBody(response);
            await sleep(retryDecision.delayMs, [options.signal, config.signal]);
            continue;
          }
          // Retry-After beyond the accepted ceiling: no retry, so no onRetry either.
          // The server's hint stays available as `BsuirApiError.retryAfterMs`.
        }
        const retryAfterMs = parseRetryAfterMs(response.headers.get("retry-after")) ?? undefined;
        const errorBody = await parseBody(response, config.maxResponseBytes, endpoint);
        const statusLabel = `BSUIR API returned HTTP ${String(response.status)} for GET ${path}`;
        const message =
          typeof errorBody === "string" && errorBody.trim().length > 0
            ? `${statusLabel}: ${summarizeErrorBody(errorBody)}`
            : statusLabel;
        // Reported to onError by the catch below, like every other failure.
        throw new BsuirApiError(message, response.status, endpoint, errorBody, retryAfterMs);
      }

      const parsed = (await parseBody(response, config.maxResponseBytes, endpoint)) as T;
      return {
        payload: parsed,
        hookCtx,
        durationMs: Date.now() - startedAt,
        status: response.status
      };
    } catch (error: unknown) {
      // Non-2xx, invalid JSON on 2xx, oversized bodies and disallowed redirects are final
      // (and must not fall through to the network-error branch below, which retries).
      if (
        error instanceof BsuirApiError ||
        error instanceof BsuirResponseValidationError ||
        error instanceof BsuirResponsePayloadTooLargeError ||
        error instanceof BsuirConfigurationError
      ) {
        const finalErrorCtx: ErrorHookContext = {
          ...hookCtx,
          durationMs: Date.now() - startedAt,
          error,
          deduplicated: false
        };
        invokeHookSafely(config.hooks.onError, finalErrorCtx);
        throw error;
      }

      // Caller cancellation first, whatever the abort reason: fetch rejects with
      // `signal.reason`, which is not an AbortError after `abort(customReason)`.
      if (options.signal?.aborted === true || config.signal?.aborted === true) {
        const abortCtx: ErrorHookContext = {
          ...hookCtx,
          durationMs: Date.now() - startedAt,
          error,
          deduplicated: false
        };
        invokeHookSafely(config.hooks.onError, abortCtx);
        throw error;
      }

      if (isAbortError(error) || requestSignal.aborted) {
        const timeoutError = new BsuirTimeoutError(
          `Request timed out after ${String(config.timeoutMs)}ms: ${path}`,
          endpoint,
          config.timeoutMs,
          error
        );
        const timeoutCtx: ErrorHookContext = {
          ...hookCtx,
          durationMs: Date.now() - startedAt,
          error: timeoutError,
          deduplicated: false
        };
        invokeHookSafely(config.hooks.onError, timeoutCtx);
        throw timeoutError;
      }

      if (attempt < maxRetries) {
        const delayMs = getRetryDelayMs(config, attempt);
        const retryCtx: RetryHookContext = {
          ...hookCtx,
          delayMs,
          reason: "network_error",
          status: undefined
        };
        invokeHookSafely(config.hooks.onRetry, retryCtx);
        await sleep(delayMs, [options.signal, config.signal]);
        continue;
      }

      const networkError = new BsuirNetworkError(
        `Network error while requesting ${path}`,
        endpoint,
        error
      );
      const networkErrorCtx: ErrorHookContext = {
        ...hookCtx,
        durationMs: Date.now() - startedAt,
        error: networkError,
        deduplicated: false
      };
      invokeHookSafely(config.hooks.onError, networkErrorCtx);
      throw networkError;
    } finally {
      requestSignalCleanup?.();
    }
  }

  throw new BsuirNetworkError(`Unexpected retry loop termination for ${path}`, endpoint, null);
}
