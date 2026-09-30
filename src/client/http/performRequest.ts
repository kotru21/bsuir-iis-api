import {
  BsuirApiError,
  BsuirNetworkError,
  BsuirResponsePayloadTooLargeError,
  BsuirTimeoutError
} from "../errors";
import { getMergedSignalCleanup, mergeSignals } from "../mergeSignals";
import { invokeHookSafely } from "./hooks";
import type {
  ErrorHookContext,
  InternalClientConfig,
  QueryParams,
  RequestHookContext,
  RequestMethod,
  RequestOptions,
  ResponseHookContext,
  RetryHookContext
} from "../types";
import { isAbortError } from "../../utils/guards";
import { cancelResponseBody, parseBody } from "./response";
import { getRetryDecision, getRetryDelayMs, RETRIABLE_STATUS_CODES, sleep } from "./retry";

const MAX_ERROR_BODY_IN_MESSAGE = 300;

/** One-line, length-capped preview of a text error body; the full body stays in `error.body`. */
function summarizeErrorBody(body: string): string {
  const compact = body.replaceAll(/\s+/g, " ").trim();
  if (compact.length <= MAX_ERROR_BODY_IN_MESSAGE) {
    return compact;
  }
  return `${compact.slice(0, MAX_ERROR_BODY_IN_MESSAGE)}… (${String(compact.length)} chars)`;
}

/** Builds the hook context shared by all lifecycle events of a single attempt. */
export function baseHookContext(
  method: RequestMethod,
  path: string,
  endpoint: string,
  attempt: number,
  maxAttempts: number,
  query: QueryParams | undefined
): RequestHookContext {
  return {
    method,
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
  method: RequestMethod;
  headers: Headers;
  body: BodyInit | undefined;
  options: RequestOptions;
  maxRetries: number;
  maxAttempts: number;
  onSuccessMeta: (meta: {
    hookCtx: RequestHookContext;
    durationMs: number;
    status: number;
  }) => void;
}

/**
 * Executes a single HTTP request with retry/backoff and lifecycle hooks.
 */
export async function performRequestWithRetry<T>(params: PerformRequestParams): Promise<T> {
  const {
    config,
    path,
    endpoint,
    method,
    headers,
    body,
    options,
    maxRetries,
    maxAttempts,
    onSuccessMeta
  } = params;

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
        error: reason
      });
      throw reason;
    }

    const attemptNumber = attempt + 1;
    const startedAt = Date.now();
    const hookCtx = baseHookContext(
      method,
      path,
      endpoint,
      attemptNumber,
      maxAttempts,
      options.query
    );
    previousAttempt = { hookCtx, startedAt };

    invokeHookSafely(config.hooks.onRequest, hookCtx);

    const requestSignal = mergeSignals([options.signal, config.signal], config.timeoutMs);
    const requestSignalCleanup = getMergedSignalCleanup(requestSignal);

    try {
      const requestInit: RequestInit = {
        method,
        headers,
        signal: requestSignal
      };
      if (body !== undefined) {
        requestInit.body = body;
      }

      const response = await config.fetchImpl(endpoint, requestInit);

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
          const skipRetryCtx: RetryHookContext = {
            ...hookCtx,
            delayMs: retryDecision.rejectedDelayMs,
            reason: "retry_after_too_large",
            status: response.status
          };
          invokeHookSafely(config.hooks.onRetry, skipRetryCtx);
        }
        const errorBody = await parseBody(response, config.maxResponseBytes, endpoint);
        const statusLabel = `BSUIR API returned HTTP ${String(response.status)} for ${method} ${path}`;
        const message =
          typeof errorBody === "string" && errorBody.trim().length > 0
            ? `${statusLabel}: ${summarizeErrorBody(errorBody)}`
            : statusLabel;
        // Reported to onError by the catch below, like every other failure.
        throw new BsuirApiError(message, response.status, endpoint, errorBody);
      }

      const parsed = (await parseBody(response, config.maxResponseBytes, endpoint)) as T;
      const durationMs = Date.now() - startedAt;
      const responseCtx: ResponseHookContext = {
        ...hookCtx,
        status: response.status,
        durationMs,
        fromCache: false
      };
      invokeHookSafely(config.hooks.onResponse, responseCtx);
      onSuccessMeta({ hookCtx, durationMs, status: response.status });
      return parsed;
    } catch (error: unknown) {
      // Non-2xx, invalid JSON on 2xx and oversized bodies are final: no retry.
      if (error instanceof BsuirApiError || error instanceof BsuirResponsePayloadTooLargeError) {
        const finalErrorCtx: ErrorHookContext = {
          ...hookCtx,
          durationMs: Date.now() - startedAt,
          error
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
          error
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
          error: timeoutError
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
        error: networkError
      };
      invokeHookSafely(config.hooks.onError, networkErrorCtx);
      throw networkError;
    } finally {
      requestSignalCleanup?.();
    }
  }

  throw new BsuirNetworkError(`Unexpected retry loop termination for ${path}`, endpoint, null);
}
