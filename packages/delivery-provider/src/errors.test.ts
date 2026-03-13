import { describe, expect, it } from 'vitest';

import { mapHttpFailure, mapSmtpFailure, mapTransportFailure } from './errors.js';

describe('delivery error mapping', () => {
  it('maps HTTP failures to canonical delivery codes', () => {
    expect(mapHttpFailure({ status: 429 })).toMatchObject({
      code: 'DELIVERY_RATE_LIMITED',
      retryable: true
    });
    expect(mapHttpFailure({ status: 401 }).code).toBe('DELIVERY_MISCONFIGURED');
    expect(mapHttpFailure({ status: 403 }).retryable).toBe(false);
    expect(mapHttpFailure({ status: 400 }).retryable).toBe(false);
    expect(mapHttpFailure({ status: 404 }).retryable).toBe(false);
    expect(mapHttpFailure({ status: 422 }).retryable).toBe(false);
    expect(mapHttpFailure({ status: 500 }).retryable).toBe(true);
    expect(mapHttpFailure({ message: 'network down' })).toMatchObject({
      code: 'DELIVERY_UNAVAILABLE',
      retryable: true
    });
  });

  it('maps SMTP failures to canonical delivery codes', () => {
    expect(mapSmtpFailure({ code: 'EAUTH' })).toMatchObject({
      code: 'DELIVERY_MISCONFIGURED',
      retryable: false
    });
    expect(mapSmtpFailure({ responseCode: 421 }).retryable).toBe(true);
    expect(mapSmtpFailure({ responseCode: 550 }).retryable).toBe(false);
    expect(mapSmtpFailure({ code: 'ETIMEDOUT' }).retryable).toBe(true);
  });

  it('mapTransportFailure delegates to appropriate mapper', () => {
    expect(mapTransportFailure({ status: 503 })).toMatchObject({
      code: 'DELIVERY_UNAVAILABLE',
      retryable: true
    });
    expect(
      mapTransportFailure({ code: 'EAUTH', message: 'auth failed' })
    ).toMatchObject({
      code: 'DELIVERY_MISCONFIGURED',
      retryable: false
    });
    expect(mapTransportFailure({ type: 'timeout-after-dispatch' })).toMatchObject({
      code: 'DELIVERY_UNAVAILABLE',
      retryable: false
    });
  });
});
