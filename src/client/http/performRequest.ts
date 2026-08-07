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

  for (let attempt = 0; attempt <= maxRetries; attempt += 1) {
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
        const errorBody = await parseBody(response, config.maxResponseBytes);
        const statusLabel = `BSUIR API returned HTTP ${String(response.status)} for ${method} ${path}`;
        const message =
          typeof errorBody === "string" && errorBody.length > 0
            ? `${statusLabel}: ${errorBody}`
            : statusLabel;
        const apiError = new BsuirApiError(message, response.status, endpoint, errorBody);
        const errorCtx: ErrorHookContext = {
          ...hookCtx,
          durationMs: Date.now() - startedAt,
          error: apiError
        };
        invokeHookSafely(config.hooks.onError, errorCtx);
        throw apiError;
      }

      const parsed = (await parseBody(response, config.maxResponseBytes)) as T;
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
      if (error instanceof BsuirApiError) {
        throw error;
      }

      if (error instanceof BsuirResponsePayloadTooLargeError) {
        const payloadTooLargeCtx: ErrorHookContext = {
          ...hookCtx,
          durationMs: Date.now() - startedAt,
          error
        };
        invokeHookSafely(config.hooks.onError, payloadTooLargeCtx);
        throw error;
      }

      if (isAbortError(error)) {
        if (options.signal?.aborted || config.signal?.aborted) {
          const abortCtx: ErrorHookContext = {
            ...hookCtx,
            durationMs: Date.now() - startedAt,
            error
          };
          invokeHookSafely(config.hooks.onError, abortCtx);
          throw error;
        }
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
