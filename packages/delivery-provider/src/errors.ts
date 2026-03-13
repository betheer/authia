import type { AuthError } from '@authia/contracts';

import type { DeliveryErrorCode } from './types.js';

type HttpFailure = {
  status?: number;
  message?: string;
};

type SmtpFailure = {
  code?: string;
  responseCode?: number;
  message?: string;
};

type TimeoutFailure = {
  type?: string;
  message?: string;
};

const networkErrorCodes = new Set([
  'ETIMEDOUT',
  'ECONNECTION',
  'ECONNRESET',
  'ECONNREFUSED',
  'EPIPE',
  'EAI_AGAIN',
  'ENETUNREACH',
  'EHOSTUNREACH',
  'ENOTFOUND'
]);

const defaultMessages: Record<DeliveryErrorCode, string> = {
  DELIVERY_UNAVAILABLE: 'Delivery provider is unavailable.',
  DELIVERY_RATE_LIMITED: 'Delivery provider rate limited the request.',
  DELIVERY_MISCONFIGURED: 'Delivery provider credentials or configuration are invalid.'
};

function createDeliveryError(code: DeliveryErrorCode, retryable: boolean, message?: string): AuthError {
  return {
    category: 'infrastructure',
    code,
    message: message ?? defaultMessages[code],
    retryable
  };
}

export function mapHttpFailure(input: HttpFailure = {}): AuthError {
  if (input?.status === 429) {
    return createDeliveryError('DELIVERY_RATE_LIMITED', true);
  }

  if (input?.status === 401 || input?.status === 403) {
    return createDeliveryError('DELIVERY_MISCONFIGURED', false);
  }

  if ([400, 404, 422].includes(input?.status ?? 0)) {
    return createDeliveryError('DELIVERY_UNAVAILABLE', false, 'Delivery request was rejected by the provider.');
  }

  if (typeof input?.status === 'number' && input.status >= 500) {
    return createDeliveryError('DELIVERY_UNAVAILABLE', true);
  }

  return createDeliveryError(
    'DELIVERY_UNAVAILABLE',
    true,
    input?.message ?? 'Delivery request failed due to network error.'
  );
}

export function mapSmtpFailure(input: SmtpFailure = {}): AuthError {
  if (input?.code === 'EAUTH') {
    return createDeliveryError('DELIVERY_MISCONFIGURED', false, 'SMTP authentication failed.');
  }

  if (input?.code && networkErrorCodes.has(input.code)) {
    return createDeliveryError('DELIVERY_UNAVAILABLE', true, input.message ?? 'SMTP transport unavailable.');
  }

  if (typeof input?.responseCode === 'number') {
    if (input.responseCode >= 400 && input.responseCode < 500) {
      return createDeliveryError('DELIVERY_UNAVAILABLE', true, 'SMTP temporary failure.');
    }
    if (input.responseCode >= 500) {
      return createDeliveryError('DELIVERY_UNAVAILABLE', false, 'SMTP permanent failure.');
    }
  }

  return createDeliveryError('DELIVERY_UNAVAILABLE', false, input?.message ?? 'SMTP delivery failed.');
}

export function mapTransportFailure(error: unknown): AuthError {
  if (isTimeoutAfterDispatch(error)) {
    return createDeliveryError('DELIVERY_UNAVAILABLE', false, error.message ?? 'Delivery status unknown after dispatch.');
  }

  if (isTimeoutError(error)) {
    return createDeliveryError('DELIVERY_UNAVAILABLE', true, error.message ?? 'Delivery attempt timed out.');
  }

  if (isHttpFailure(error)) {
    return mapHttpFailure(error);
  }

  return mapSmtpFailure(isObject(error) ? (error as SmtpFailure) : undefined);
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function isHttpFailure(error: unknown): error is HttpFailure {
  return isObject(error) && 'status' in error;
}

function isTimeoutAfterDispatch(error: unknown): error is TimeoutFailure {
  if (!isObject(error)) {
    return false;
  }

  const typed = error as { type?: unknown; code?: unknown };
  return typed.type === 'timeout-after-dispatch' || typed.code === 'TIMEOUT_AFTER_DISPATCH';
}

function isTimeoutError(error: unknown): error is TimeoutFailure {
  if (!isObject(error)) {
    return false;
  }

  const typed = error as { type?: unknown; code?: unknown };
  return typed.type === 'timeout' || typed.code === 'ETIMEDOUT';
}
