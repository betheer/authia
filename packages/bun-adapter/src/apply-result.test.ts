import type { AuthError, AuthResult } from '@authia/contracts';
import { describe, expect, it } from 'vitest';
import { applyResult } from './apply-result.js';

describe('applyResult', () => {
  it('returns AuthError as-is if category is present', async () => {
    const error: AuthError = {
      category: 'infrastructure',
      code: 'RUNTIME_MISCONFIGURED',
      message: 'Test Error',
      retryable: false
    };
    const result = await applyResult(error);
    expect(result).toBe(error);
  });

  describe('success results', () => {
    it('returns status 204 with no body for no-content actions like logout', async () => {
      const result: AuthResult = { kind: 'success', action: 'logout' };
      const response = await applyResult(result);
      expect(response).toEqual({
        status: 204,
        headers: {},
        clearBearer: undefined,
        clearCookies: undefined,
        setCookies: undefined,
        body: undefined
      });
    });

    it('returns status 200 with body for other success actions', async () => {
      const result: AuthResult = { kind: 'success', action: 'login', data: { user: 'test' } };
      const response = await applyResult(result);
      expect(response).toEqual({
        status: 200,
        headers: {},
        clearBearer: undefined,
        clearCookies: undefined,
        setCookies: undefined,
        body: result
      });
    });

    it('maps response mutations correctly', async () => {
      const result: AuthResult = {
        kind: 'success',
        action: 'login',
        responseMutations: {
          clearBearer: true,
          clearCookies: ['test'],
          setCookies: [{ name: 'test', value: '123' }]
        }
      };
      const response = await applyResult(result);
      expect(response).toEqual({
        status: 200,
        headers: {},
        clearBearer: true,
        clearCookies: ['test'],
        setCookies: [{ name: 'test', value: '123' }],
        body: result
      });
    });
  });

  describe('denied results', () => {
    it('maps DUPLICATE_IDENTITY to 409', async () => {
      const result: AuthResult = { kind: 'denied', action: 'register', code: 'DUPLICATE_IDENTITY' };
      const response = await applyResult(result);
      expect(response).toEqual({
        status: 409,
        headers: {},
        body: { kind: 'denied', code: 'DUPLICATE_IDENTITY' }
      });
    });

    it('maps POLICY_DENIED to 403', async () => {
      const result: AuthResult = { kind: 'denied', action: 'register', code: 'POLICY_DENIED' };
      const response = await applyResult(result);
      expect(response).toEqual({
        status: 403,
        headers: {},
        body: { kind: 'denied', code: 'POLICY_DENIED' }
      });
    });

    it('maps RATE_LIMITED to 429', async () => {
      const result: AuthResult = { kind: 'denied', action: 'register', code: 'RATE_LIMITED' };
      const response = await applyResult(result);
      expect(response).toEqual({
        status: 429,
        headers: {},
        body: { kind: 'denied', code: 'RATE_LIMITED' }
      });
    });

    it('maps other codes to 400', async () => {
      const result: AuthResult = { kind: 'denied', action: 'register', code: 'OTHER' as any };
      const response = await applyResult(result);
      expect(response).toEqual({
        status: 400,
        headers: {},
        body: { kind: 'denied', code: 'OTHER' }
      });
    });
  });

  describe('unauthenticated results', () => {
    it('maps to 401', async () => {
      const result: AuthResult = { kind: 'unauthenticated', action: 'user' };
      const response = await applyResult(result);
      expect(response).toEqual({
        status: 401,
        headers: {},
        body: { kind: 'unauthenticated', code: undefined }
      });
    });
  });

  describe('redirect results', () => {
    it('maps to 303 with location header if allowed', async () => {
      const result: AuthResult = {
        kind: 'redirect',
        action: 'login',
        responseMutations: { redirectTo: 'https://example.com' }
      };
      const response = await applyResult(result);
      expect(response).toEqual({
        status: 303,
        headers: { location: 'https://example.com' }
      });
    });

    it('returns RUNTIME_MISCONFIGURED error if redirects not allowed', async () => {
      const result: AuthResult = {
        kind: 'redirect',
        action: 'login',
        responseMutations: { redirectTo: 'https://example.com' }
      };
      const response = await applyResult(result, { redirects: false });
      expect(response).toEqual({
        category: 'infrastructure',
        code: 'RUNTIME_MISCONFIGURED',
        message: 'Runtime adapter does not support redirects.',
        retryable: false
      });
    });
  });

  describe('error handling', () => {
    it('catches and maps unexpected errors to RESPONSE_APPLY_FAILED AuthError', async () => {
      const badResult = { get kind() { throw new Error('Simulated failure'); } } as unknown as AuthResult;
      const response = await applyResult(badResult);
      expect(response).toEqual({
        category: 'infrastructure',
        code: 'RESPONSE_APPLY_FAILED',
        message: 'Failed to map auth result to runtime response.',
        retryable: false
      });
    });
  });
});
