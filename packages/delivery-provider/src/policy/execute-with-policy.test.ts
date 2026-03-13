import { describe, expect, it } from 'vitest';

import { executeWithPolicy } from './execute-with-policy.js';

describe('executeWithPolicy', () => {
  it('retries with deterministic backoff sequence', async () => {
    const delays: number[] = [];
    let attempts = 0;

    await executeWithPolicy({
      run: async ({ attempt }) => {
        attempts = attempt;
        if (attempt < 5) {
          throw { status: 503 };
        }
      },
      sleep: async (ms) => {
        delays.push(ms);
      },
      maxRetries: 4,
      backoffMs: [100, 300, 700],
      timeoutMs: 50
    });

    expect(attempts).toBe(5);
    expect(delays).toEqual([100, 300, 700, 700]);
  });

  it('maps timeout-after-dispatch failures to non-retryable delivery errors', async () => {
    const result = await executeWithPolicy({
      run: async () => {
        throw { type: 'timeout-after-dispatch' };
      },
      sleep: async () => {},
      maxRetries: 0,
      backoffMs: [100, 300, 700],
      timeoutMs: 25
    });

    expect(result).toMatchObject({
      code: 'DELIVERY_UNAVAILABLE',
      retryable: false
    });
  });

  it('enforces per-attempt timeout and surfaces retryable timeout failures', async () => {
    const result = await executeWithPolicy({
      run: async () => new Promise(() => undefined),
      sleep: async () => {},
      maxRetries: 0,
      backoffMs: [100, 300, 700],
      timeoutMs: 5
    });

    expect(result).toMatchObject({
      code: 'DELIVERY_UNAVAILABLE',
      retryable: true
    });
  });
});
