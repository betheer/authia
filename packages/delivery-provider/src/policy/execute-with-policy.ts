import type { AuthValue } from '@authia/contracts';

import { mapTransportFailure } from '../errors.js';
import type { ExecuteWithPolicyInput } from '../types.js';

const defaultSleep = (ms: number) =>
  new Promise<void>((resolve) => {
    setTimeout(resolve, ms);
  });

export async function executeWithPolicy(input: ExecuteWithPolicyInput): Promise<AuthValue<void>> {
  const sleep = input.sleep ?? defaultSleep;
  const backoffSequence = input.backoffMs.length > 0 ? input.backoffMs : [0];

  for (let attemptIndex = 0; attemptIndex <= input.maxRetries; attemptIndex += 1) {
    const attemptNumber = attemptIndex + 1;
    try {
      await runWithTimeout(input.run({ attempt: attemptNumber }), input.timeoutMs);
      return undefined;
    } catch (error) {
      const mapped = mapTransportFailure(error);
      const hasRetriesRemaining = attemptIndex < input.maxRetries;

      if (!mapped.retryable || !hasRetriesRemaining) {
        return mapped;
      }

      const backoffIndex = Math.min(attemptIndex, backoffSequence.length - 1);
      await sleep(backoffSequence[backoffIndex]);
    }
  }

  return mapTransportFailure({ type: 'timeout-after-dispatch' });
}

function runWithTimeout<T>(operation: Promise<T>, timeoutMs: number): Promise<T> {
  if (timeoutMs <= 0) {
    return operation;
  }

  return new Promise<T>((resolve, reject) => {
    const timeoutId = setTimeout(() => {
      reject({ type: 'timeout' });
    }, timeoutMs);

    operation.then(
      (value) => {
        clearTimeout(timeoutId);
        resolve(value);
      },
      (error) => {
        clearTimeout(timeoutId);
        reject(error);
      }
    );
  });
}
