import {
  BsuirApiError,
  BsuirNetworkError,
  BsuirResponsePayloadTooLargeError,
  BsuirTimeoutError
} from "../errors";
import { getMergedSignalCleanup, mergeSignals } from "../mergeSignals";
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
import { parseBody } from "./response";
import { getRetryDecision, getRetryDelayMs, RETRIABLE_STATUS_CODES, sleep } from "./retry";

/**
 *
 */
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
  onSuccessMeta: (meta: { hookCtx: RequestHookContext; durationMs: number }) => void;
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

    config.hooks.onRequest?.(hookCtx);

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
        const errorBody = await parseBody(response, config.maxResponseBytes);
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
            config.hooks.onRetry?.(retryCtx);
            await sleep(retryDecision.delayMs);
            continue;
          }
          const skipRetryCtx: RetryHookContext = {
            ...hookCtx,
            delayMs: retryDecision.rejectedDelayMs,
            reason: "retry_after_too_large",
            status: response.status
          };
          config.hooks.onRetry?.(skipRetryCtx);
        }
        const apiError = new BsuirApiError(
          `BSUIR API returned HTTP ${String(response.status)} for ${method} ${path}`,
          response.status,
          endpoint,
          errorBody
        );
        const errorCtx: ErrorHookContext = {
          ...hookCtx,
          durationMs: Date.now() - startedAt,
          error: apiError
        };
        config.hooks.onError?.(errorCtx);
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
      config.hooks.onResponse?.(responseCtx);
      onSuccessMeta({ hookCtx, durationMs });
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
        config.hooks.onError?.(payloadTooLargeCtx);
        throw error;
      }

      if (isAbortError(error)) {
        if (options.signal?.aborted || config.signal?.aborted) {
          const abortCtx: ErrorHookContext = {
            ...hookCtx,
            durationMs: Date.now() - startedAt,
            error
          };
          config.hooks.onError?.(abortCtx);
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
        config.hooks.onError?.(timeoutCtx);
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
        config.hooks.onRetry?.(retryCtx);
        await sleep(delayMs);
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
      config.hooks.onError?.(networkErrorCtx);
      throw networkError;
    } finally {
      requestSignalCleanup?.();
    }
  }

  throw new BsuirNetworkError(`Unexpected retry loop termination for ${path}`, endpoint, null);
}
