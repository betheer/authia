import { describe, expect, it } from 'vitest';
import { parseRequest } from './parse-request.js';
import type { AuthConfig, RequestContext } from '@authia/contracts';

function createConfig(overrides?: Partial<Pick<AuthConfig, 'entrypointMethods' | 'entrypointPaths' | 'entrypointTransport' | 'sessionCookieName' | 'publicOrigin' | 'trustedForwardedHeaders'>>) {
  return {
    entrypointMethods: {
      signInWithPassword: 'POST',
      getSession: 'GET',
    },
    entrypointPaths: {
      signInWithPassword: '/auth/signin',
      getSession: '/auth/session',
    },
    entrypointTransport: {
      signInWithPassword: 'bearer',
      getSession: 'cookie',
    },
    sessionCookieName: 'auth_session',
    publicOrigin: 'https://example.com',
    trustedForwardedHeaders: [],
    ...overrides
  } as Pick<AuthConfig, 'entrypointMethods' | 'entrypointPaths' | 'entrypointTransport' | 'sessionCookieName' | 'publicOrigin' | 'trustedForwardedHeaders'>;
}

describe('parseRequest', () => {
  it('returns notHandled when action cannot be resolved', async () => {
    const config = createConfig();
    const result = await parseRequest({
      method: 'GET',
      url: 'https://example.com/unknown',
      headers: {},
      cookies: {}
    }, config);

    expect(result).toEqual({ kind: 'notHandled' });
  });

  it('rejects duplicate sensitive headers', async () => {
    const config = createConfig();
    const result = await parseRequest({
      method: 'POST',
      url: 'https://example.com/auth/signin',
      headers: {
        authorization: ['Bearer token1', 'Bearer token2']
      },
      cookies: {}
    }, config);

    expect(result).toEqual({ kind: 'denied', code: 'INVALID_INPUT' });
  });

  it('rejects duplicate trusted forwarded headers when configured', async () => {
    const config = createConfig({ trustedForwardedHeaders: ['x-forwarded-host', 'x-forwarded-proto'] });
    const result = await parseRequest({
      method: 'POST',
      url: 'https://example.com/auth/signin',
      headers: {
        'x-forwarded-host': ['host1', 'host2']
      },
      cookies: {}
    }, config);

    expect(result).toEqual({ kind: 'denied', code: 'INVALID_INPUT' });
  });

  describe('trusted forwarded headers logic', () => {
    it('returns RUNTIME_MISCONFIGURED if only one of x-forwarded-host or x-forwarded-proto is present', async () => {
      const config = createConfig({ trustedForwardedHeaders: ['x-forwarded-host', 'x-forwarded-proto'] });

      const resultHostOnly = await parseRequest({
        method: 'POST',
        url: 'https://example.com/auth/signin',
        headers: { 'x-forwarded-host': 'other.com' },
        cookies: {}
      }, config);
      expect(resultHostOnly).toEqual({ category: 'infrastructure', code: 'RUNTIME_MISCONFIGURED', message: 'Both x-forwarded-host and x-forwarded-proto must be present together.', retryable: false });

      const resultProtoOnly = await parseRequest({
        method: 'POST',
        url: 'https://example.com/auth/signin',
        headers: { 'x-forwarded-proto': 'https' },
        cookies: {}
      }, config);
      expect(resultProtoOnly).toEqual({ category: 'infrastructure', code: 'RUNTIME_MISCONFIGURED', message: 'Both x-forwarded-host and x-forwarded-proto must be present together.', retryable: false });
    });

    it('returns RUNTIME_MISCONFIGURED if forwarded origin does not match publicOrigin', async () => {
      const config = createConfig({ trustedForwardedHeaders: ['x-forwarded-host', 'x-forwarded-proto'] });

      const result = await parseRequest({
        method: 'POST',
        url: 'https://example.com/auth/signin',
        headers: {
          'x-forwarded-host': 'evil.com',
          'x-forwarded-proto': 'https'
        },
        cookies: {}
      }, config);

      expect(result).toEqual({ category: 'infrastructure', code: 'RUNTIME_MISCONFIGURED', message: 'Forwarded host/proto must match publicOrigin.', retryable: false });
    });

    it('passes if forwarded origin matches publicOrigin', async () => {
      const config = createConfig({ trustedForwardedHeaders: ['x-forwarded-host', 'x-forwarded-proto'] });

      const result = await parseRequest({
        method: 'POST',
        url: 'https://example.com/auth/signin',
        headers: {
          'x-forwarded-host': 'example.com',
          'x-forwarded-proto': 'https'
        },
        cookies: {}
      }, config);

      // We expect it to fail on missing authorization or missing credentials, not RUNTIME_MISCONFIGURED
      expect(result).not.toEqual({ category: 'infrastructure', code: 'RUNTIME_MISCONFIGURED', message: expect.any(String), retryable: false });
    });
  });

  describe('authorization and cookies', () => {
    it('returns INVALID_INPUT for non-Bearer authorization header', async () => {
      const config = createConfig();
      const result = await parseRequest({
        method: 'POST',
        url: 'https://example.com/auth/signin',
        headers: { authorization: 'Basic dGVzdDp0ZXN0' },
        cookies: {}
      }, config);

      expect(result).toEqual({ kind: 'denied', code: 'INVALID_INPUT' });
    });

    it('returns INVALID_INPUT for invalid Bearer token', async () => {
      const config = createConfig();
      const result = await parseRequest({
        method: 'POST',
        url: 'https://example.com/auth/signin',
        headers: { authorization: 'Bearer tok en' },
        cookies: {}
      }, config);

      expect(result).toEqual({ kind: 'denied', code: 'INVALID_INPUT' });

      const emptyResult = await parseRequest({
        method: 'POST',
        url: 'https://example.com/auth/signin',
        headers: { authorization: 'Bearer   ' },
        cookies: {}
      }, config);

      expect(emptyResult).toEqual({ kind: 'denied', code: 'INVALID_INPUT' });
    });

    it('returns AMBIGUOUS_CREDENTIALS if both cookie and bearer token are provided', async () => {
      const config = createConfig();
      const result = await parseRequest({
        method: 'POST',
        url: 'https://example.com/auth/signin',
        headers: { authorization: 'Bearer token123' },
        cookies: { auth_session: 'session123' }
      }, config);

      expect(result).toEqual({ kind: 'denied', code: 'AMBIGUOUS_CREDENTIALS' });
    });

    it('returns INVALID_INPUT if provided credential kind does not match expectedTransport', async () => {
      const config = createConfig();
      // signInWithPassword expects 'bearer'
      const resultCookie = await parseRequest({
        method: 'POST',
        url: 'https://example.com/auth/signin',
        headers: {},
        cookies: { auth_session: 'session123' }
      }, config);

      expect(resultCookie).toEqual({ kind: 'denied', code: 'INVALID_INPUT' });

      // getSession expects 'cookie'
      const resultBearer = await parseRequest({
        method: 'GET',
        url: 'https://example.com/auth/session',
        headers: { authorization: 'Bearer token123' },
        cookies: {}
      }, config);

      expect(resultBearer).toEqual({ kind: 'denied', code: 'INVALID_INPUT' });
    });
  });

  describe('body parsing', () => {
    it('returns INVALID_INPUT if body string cannot be parsed as JSON', async () => {
      const config = createConfig();
      const result = await parseRequest({
        method: 'POST',
        url: 'https://example.com/auth/signin',
        headers: { authorization: 'Bearer token123' },
        cookies: {},
        body: 'invalid json'
      }, config);

      expect(result).toEqual({ kind: 'denied', code: 'INVALID_INPUT' });
    });

    it('returns INVALID_INPUT if parsed body string is not an object', async () => {
      const config = createConfig();
      const result = await parseRequest({
        method: 'POST',
        url: 'https://example.com/auth/signin',
        headers: { authorization: 'Bearer token123' },
        cookies: {},
        body: '"string"'
      }, config);

      expect(result).toEqual({ kind: 'denied', code: 'INVALID_INPUT' });

      const nullResult = await parseRequest({
        method: 'POST',
        url: 'https://example.com/auth/signin',
        headers: { authorization: 'Bearer token123' },
        cookies: {},
        body: 'null'
      }, config);

      expect(nullResult).toEqual({ kind: 'denied', code: 'INVALID_INPUT' });
    });

    it('returns INVALID_INPUT if body object is not an object or is null', async () => {
      const config = createConfig();
      const result = await parseRequest({
        method: 'POST',
        url: 'https://example.com/auth/signin',
        headers: { authorization: 'Bearer token123' },
        cookies: {},
        body: null
      }, config);

      expect(result).toEqual({ kind: 'denied', code: 'INVALID_INPUT' });

      const numberResult = await parseRequest({
        method: 'POST',
        url: 'https://example.com/auth/signin',
        headers: { authorization: 'Bearer token123' },
        cookies: {},
        body: 123
      }, config);

      expect(numberResult).toEqual({ kind: 'denied', code: 'INVALID_INPUT' });
    });

    it('accepts valid object body directly', async () => {
      const config = createConfig();
      const result = await parseRequest({
        method: 'POST',
        url: 'https://example.com/auth/signin',
        headers: { authorization: 'Bearer token123' },
        cookies: {},
        body: { foo: 'bar' }
      }, config);

      expect((result as RequestContext).body).toEqual({ foo: 'bar' });
    });
  });

  describe('action specific validations', () => {
    const config = createConfig({
      entrypointMethods: { startOAuth: 'POST', finishOAuth: 'POST', requestPasswordReset: 'POST', resetPassword: 'POST', requestEmailVerification: 'POST', verifyEmail: 'POST' } as any,
      entrypointPaths: { startOAuth: '/auth/oauth/start', finishOAuth: '/auth/oauth/finish', requestPasswordReset: '/auth/password/request-reset', resetPassword: '/auth/password/reset', requestEmailVerification: '/auth/email/request-verification', verifyEmail: '/auth/email/verify' } as any,
      entrypointTransport: { startOAuth: 'cookie', finishOAuth: 'cookie', requestPasswordReset: 'cookie', resetPassword: 'cookie', requestEmailVerification: 'cookie', verifyEmail: 'cookie' } as any
    });

    const createReq = (pathname: string, body: any) => ({
      method: 'POST',
      url: `https://example.com${pathname}`,
      headers: {},
      cookies: { auth_session: 'session123' }, // provided expected transport
      body
    });

    describe('startOAuth', () => {
      it('returns INVALID_INPUT if provider is missing or empty', async () => {
        expect(await parseRequest(createReq('/auth/oauth/start', {}), config)).toEqual({ kind: 'denied', code: 'INVALID_INPUT' });
        expect(await parseRequest(createReq('/auth/oauth/start', { provider: '   ' }), config)).toEqual({ kind: 'denied', code: 'INVALID_INPUT' });
      });

      it('returns INVALID_INPUT if redirectTo is provided but is not a relative string', async () => {
        expect(await parseRequest(createReq('/auth/oauth/start', { provider: 'github', redirectTo: 123 }), config)).toEqual({ kind: 'denied', code: 'INVALID_INPUT' });
        expect(await parseRequest(createReq('/auth/oauth/start', { provider: 'github', redirectTo: 'https://evil.com' }), config)).toEqual({ kind: 'denied', code: 'INVALID_INPUT' });
        expect(await parseRequest(createReq('/auth/oauth/start', { provider: 'github', redirectTo: '//evil.com' }), config)).toEqual({ kind: 'denied', code: 'INVALID_INPUT' });
      });

      it('passes with valid payload', async () => {
        const result = await parseRequest(createReq('/auth/oauth/start', { provider: 'github', redirectTo: '/dashboard' }), config);
        expect((result as RequestContext).action).toBe('startOAuth');
      });
    });

    describe('finishOAuth', () => {
      it('returns INVALID_INPUT if required fields are missing or empty', async () => {
        expect(await parseRequest(createReq('/auth/oauth/finish', { provider: 'github', code: 'code123' }), config)).toEqual({ kind: 'denied', code: 'INVALID_INPUT' });
        expect(await parseRequest(createReq('/auth/oauth/finish', { provider: 'github', state: 'state123' }), config)).toEqual({ kind: 'denied', code: 'INVALID_INPUT' });
        expect(await parseRequest(createReq('/auth/oauth/finish', { code: 'code123', state: 'state123' }), config)).toEqual({ kind: 'denied', code: 'INVALID_INPUT' });
        expect(await parseRequest(createReq('/auth/oauth/finish', { provider: 'github', code: ' ', state: 'state123' }), config)).toEqual({ kind: 'denied', code: 'INVALID_INPUT' });
      });

      it('passes with valid payload', async () => {
        const result = await parseRequest(createReq('/auth/oauth/finish', { provider: 'github', code: 'code123', state: 'state123' }), config);
        expect((result as RequestContext).action).toBe('finishOAuth');
      });
    });

    describe('requestPasswordReset', () => {
      it('returns INVALID_INPUT if email is missing or empty', async () => {
        expect(await parseRequest(createReq('/auth/password/request-reset', {}), config)).toEqual({ kind: 'denied', code: 'INVALID_INPUT' });
        expect(await parseRequest(createReq('/auth/password/request-reset', { email: '  ' }), config)).toEqual({ kind: 'denied', code: 'INVALID_INPUT' });
      });

      it('passes with valid payload', async () => {
        const result = await parseRequest(createReq('/auth/password/request-reset', { email: 'test@example.com' }), config);
        expect((result as RequestContext).action).toBe('requestPasswordReset');
      });
    });

    describe('resetPassword', () => {
      it('returns INVALID_INPUT if resetToken or password are missing or empty', async () => {
        expect(await parseRequest(createReq('/auth/password/reset', { password: 'pass' }), config)).toEqual({ kind: 'denied', code: 'INVALID_INPUT' });
        expect(await parseRequest(createReq('/auth/password/reset', { resetToken: 'token' }), config)).toEqual({ kind: 'denied', code: 'INVALID_INPUT' });
      });

      it('passes with valid payload', async () => {
        const result = await parseRequest(createReq('/auth/password/reset', { resetToken: 'token123', password: 'newpass' }), config);
        expect((result as RequestContext).action).toBe('resetPassword');
      });
    });

    describe('requestEmailVerification', () => {
      it('returns INVALID_INPUT if email is missing or empty', async () => {
        expect(await parseRequest(createReq('/auth/email/request-verification', {}), config)).toEqual({ kind: 'denied', code: 'INVALID_INPUT' });
      });

      it('passes with valid payload', async () => {
        const result = await parseRequest(createReq('/auth/email/request-verification', { email: 'test@example.com' }), config);
        expect((result as RequestContext).action).toBe('requestEmailVerification');
      });
    });

    describe('verifyEmail', () => {
      it('returns INVALID_INPUT if verificationToken is missing or empty', async () => {
        expect(await parseRequest(createReq('/auth/email/verify', {}), config)).toEqual({ kind: 'denied', code: 'INVALID_INPUT' });
      });

      it('passes with valid payload', async () => {
        const result = await parseRequest(createReq('/auth/email/verify', { verificationToken: 'token123' }), config);
        expect((result as RequestContext).action).toBe('verifyEmail');
      });
    });
  });

  describe('valid requests', () => {
    it('returns a RequestContext for valid requests', async () => {
      const config = createConfig();
      const result = await parseRequest({
        method: 'POST',
        url: 'https://example.com/auth/signin',
        headers: { authorization: 'Bearer token123' },
        cookies: {},
        body: { username: 'test' }
      }, config);

      expect(result).toEqual({
        action: 'signInWithPassword',
        runtime: 'node',
        method: 'POST',
        url: 'https://example.com/auth/signin',
        transport: 'bearer',
        headers: { authorization: 'Bearer token123' },
        cookies: {},
        credential: { kind: 'bearer', token: 'token123' },
        body: { username: 'test' }
      });
    });

    it('handles requests with no credentials if action allows it', async () => {
      const config = createConfig();
      const result = await parseRequest({
        method: 'POST',
        url: 'https://example.com/auth/signin',
        headers: {}, // no authorization
        cookies: {}, // no cookies
        body: { username: 'test' }
      }, config);

      expect(result).toEqual({
        action: 'signInWithPassword',
        runtime: 'node',
        method: 'POST',
        url: 'https://example.com/auth/signin',
        transport: 'bearer',
        headers: {},
        cookies: {},
        credential: undefined,
        body: { username: 'test' }
      });
    });
  });
});
