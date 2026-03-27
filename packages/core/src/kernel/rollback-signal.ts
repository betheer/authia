import type { AuthResult, AuthError, RollbackSignal } from '@authia/contracts';

export function createRollbackSignal(outcome: AuthResult | AuthError): RollbackSignal {
  return { outcome };
}

export function isRollbackSignal(error: unknown): error is RollbackSignal {
  return typeof error === 'object' && error !== null && 'outcome' in error;
}
