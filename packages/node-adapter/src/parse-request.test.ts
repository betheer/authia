import { describe, expect, it } from 'vitest';
import { parseRequest } from './parse-request.js';
import type { AuthConfig } from '@authia/contracts';

type ConfigParams = Pick<
  AuthConfig,
  'entrypointMethods' | 'entrypointPaths' | 'entrypointTransport' | 'sessionCookieName' | 'publicOrigin' | 'trustedForwardedHeaders'
>;

function createBaseConfig(): ConfigParams {
  return {
    entrypointMethods: {
      signUpWithPassword: 'POST',
      signInWithPassword: 'POST',
      requestPasswordReset: 'POST',
      resetPassword: 'POST',
      requestEmailVerification: 'POST',
      verifyEmail: 'POST',
      getSession: 'GET',
      refreshSession: 'POST',
      logout: 'POST',
      logoutAll: 'POST',
      startOAuth: 'POST',
      finishOAuth: 'POST',
    },
    entrypointPaths: {
      signUpWithPassword: '/auth/signup',
      signInWithPassword: '/auth/signin',
      requestPasswordReset: '/auth/password-reset/request',
      resetPassword: '/auth/password-reset/reset',
      requestEmailVerification: '/auth/email-verification/request',
      verifyEmail: '/auth/email-verification/verify',
      getSession: '/auth/session',
      refreshSession: '/auth/refresh',
      logout: '/auth/logout',
      logoutAll: '/auth/logout-all',
      startOAuth: '/auth/oauth/start',
      finishOAuth: '/auth/oauth/finish',
    },
    entrypointTransport: {
      signUpWithPassword: 'cookie',
      signInWithPassword: 'cookie',
      requestPasswordReset: 'cookie',
      resetPassword: 'cookie',
      requestEmailVerification: 'cookie',
      verifyEmail: 'cookie',
      getSession: 'cookie',
      refreshSession: 'cookie',
      logout: 'cookie',
      logoutAll: 'cookie',
      startOAuth: 'cookie',
      finishOAuth: 'cookie',
    },
    sessionCookieName: 'auth_session',
    publicOrigin: 'https://example.com',
    trustedForwardedHeaders: [],
  };
}

describe('parseRequest - Routing', () => {
  it('returns notHandled when route does not match any action', async () => {
    const config = createBaseConfig();
    const result = await parseRequest(
      {
        method: 'GET',
        url: 'https://example.com/not-auth',
        headers: {},
        cookies: {},
      },
      config
    );
    expect(result).toEqual({ kind: 'notHandled' });
  });

  it('matches a valid route and returns RequestContext', async () => {
    const config = createBaseConfig();
    const result = await parseRequest(
      {
        method: 'POST',
        url: 'https://example.com/auth/signin',
        headers: {},
        cookies: {},
      },
      config
    );

    expect(result).toMatchObject({
      action: 'signInWithPassword',
      runtime: 'node',
      method: 'POST',
      url: 'https://example.com/auth/signin',
    });
  });
});

describe('parseRequest - Header Validation', () => {
  it('rejects duplicate sensitive headers with invalidInputResult', async () => {
    const config = createBaseConfig();
    const result = await parseRequest(
      {
        method: 'POST',
        url: 'https://example.com/auth/signin',
        headers: {
          authorization: ['Bearer a', 'Bearer b'],
        },
        cookies: {},
      },
      config
    );
    expect(result).toEqual({ kind: 'denied', code: 'INVALID_INPUT' });
  });

  it('normalizes headers to lowercase and extracts single values', async () => {
    const config = createBaseConfig();
    const result = await parseRequest(
      {
        method: 'POST',
        url: 'https://example.com/auth/signin',
        headers: {
          'X-Custom-Header': 'CustomValue',
          Accept: ['application/json'],
        },
        cookies: {},
      },
      config
    );

    expect(result).toMatchObject({
      headers: {
        'x-custom-header': 'CustomValue',
        accept: 'application/json',
      },
    });
  });
});

describe('parseRequest - Forwarded Headers Logic', () => {
  it('returns runtimeMisconfigured if forwarded host is present but proto is missing', async () => {
    const config = createBaseConfig();
    config.trustedForwardedHeaders = ['x-forwarded-host', 'x-forwarded-proto'];

    const result = await parseRequest(
      {
        method: 'POST',
        url: 'https://example.com/auth/signin',
        headers: {
          'x-forwarded-host': 'auth.example.com',
        },
        cookies: {},
      },
      config
    );

    expect(result).toMatchObject({
      category: 'infrastructure',
      code: 'RUNTIME_MISCONFIGURED',
      message: 'Both x-forwarded-host and x-forwarded-proto must be present together.',
    });
  });

  it('returns runtimeMisconfigured if forwarded proto is present but host is missing', async () => {
    const config = createBaseConfig();
    config.trustedForwardedHeaders = ['x-forwarded-host', 'x-forwarded-proto'];

    const result = await parseRequest(
      {
        method: 'POST',
        url: 'https://example.com/auth/signin',
        headers: {
          'x-forwarded-proto': 'https',
        },
        cookies: {},
      },
      config
    );

    expect(result).toMatchObject({
      category: 'infrastructure',
      code: 'RUNTIME_MISCONFIGURED',
      message: 'Both x-forwarded-host and x-forwarded-proto must be present together.',
    });
  });

  it('returns runtimeMisconfigured if forwarded origin does not match publicOrigin', async () => {
    const config = createBaseConfig();
    config.trustedForwardedHeaders = ['x-forwarded-host', 'x-forwarded-proto'];
    config.publicOrigin = 'https://example.com';

    const result = await parseRequest(
      {
        method: 'POST',
        url: 'http://internal-ip/auth/signin',
        headers: {
          'x-forwarded-host': 'malicious.com',
          'x-forwarded-proto': 'https',
        },
        cookies: {},
      },
      config
    );

    expect(result).toMatchObject({
      category: 'infrastructure',
      code: 'RUNTIME_MISCONFIGURED',
      message: 'Forwarded host/proto must match publicOrigin.',
    });
  });

  it('accepts request if forwarded origin matches publicOrigin', async () => {
    const config = createBaseConfig();
    config.trustedForwardedHeaders = ['x-forwarded-host', 'x-forwarded-proto'];
    config.publicOrigin = 'https://example.com';

    const result = await parseRequest(
      {
        method: 'POST',
        url: 'http://internal-ip/auth/signin',
        headers: {
          'x-forwarded-host': 'example.com',
          'x-forwarded-proto': 'https',
        },
        cookies: {},
      },
      config
    );

    expect(result).toMatchObject({ action: 'signInWithPassword' });
  });

  it('rejects duplicates in trusted forwarded headers', async () => {
    const config = createBaseConfig();
    config.trustedForwardedHeaders = ['x-forwarded-host', 'x-forwarded-proto'];

    const result = await parseRequest(
      {
        method: 'POST',
        url: 'https://example.com/auth/signin',
        headers: {
          'x-forwarded-host': ['example.com', 'example.com'],
          'x-forwarded-proto': 'https',
        },
        cookies: {},
      },
      config
    );

    expect(result).toEqual({ kind: 'denied', code: 'INVALID_INPUT' });
  });
});

describe('parseRequest - Credentials and Transport Validation', () => {
  it('parses Bearer token successfully', async () => {
    const config = createBaseConfig();
    config.entrypointTransport.signInWithPassword = 'bearer';

    const result = await parseRequest(
      {
        method: 'POST',
        url: 'https://example.com/auth/signin',
        headers: {
          authorization: 'Bearer my_token_123',
        },
        cookies: {},
      },
      config
    );

    expect(result).toMatchObject({
      credential: { kind: 'bearer', token: 'my_token_123' },
      transport: 'bearer',
    });
  });

  it('rejects invalid authorization headers format', async () => {
    const config = createBaseConfig();
    config.entrypointTransport.signInWithPassword = 'bearer';

    const result = await parseRequest(
      {
        method: 'POST',
        url: 'https://example.com/auth/signin',
        headers: {
          authorization: 'Basic dGVzdDp0ZXN0',
        },
        cookies: {},
      },
      config
    );

    expect(result).toEqual({ kind: 'denied', code: 'INVALID_INPUT' });
  });

  it('rejects empty or malformed bearer token', async () => {
    const config = createBaseConfig();
    config.entrypointTransport.signInWithPassword = 'bearer';

    const result1 = await parseRequest(
      {
        method: 'POST',
        url: 'https://example.com/auth/signin',
        headers: { authorization: 'Bearer ' },
        cookies: {},
      },
      config
    );
    expect(result1).toEqual({ kind: 'denied', code: 'INVALID_INPUT' });

    const result2 = await parseRequest(
      {
        method: 'POST',
        url: 'https://example.com/auth/signin',
        headers: { authorization: 'Bearer token with spaces' },
        cookies: {},
      },
      config
    );
    expect(result2).toEqual({ kind: 'denied', code: 'INVALID_INPUT' });
  });

  it('returns ambiguous credentials if both cookie and bearer token are provided', async () => {
    const config = createBaseConfig();

    const result = await parseRequest(
      {
        method: 'POST',
        url: 'https://example.com/auth/signin',
        headers: {
          authorization: 'Bearer my_token_123',
        },
        cookies: {
          [config.sessionCookieName]: 'my_cookie_token',
        },
      },
      config
    );

    expect(result).toEqual({ kind: 'denied', code: 'AMBIGUOUS_CREDENTIALS' });
  });

  it('rejects if credential kind does not match expected transport', async () => {
    const config = createBaseConfig();
    config.entrypointTransport.signInWithPassword = 'bearer';

    const result = await parseRequest(
      {
        method: 'POST',
        url: 'https://example.com/auth/signin',
        headers: {},
        cookies: {
          [config.sessionCookieName]: 'my_cookie_token',
        },
      },
      config
    );

    expect(result).toEqual({ kind: 'denied', code: 'INVALID_INPUT' });
  });

  it('rejects if no expected transport is configured for the action', async () => {
    const config = createBaseConfig();
    // @ts-expect-error - testing invalid configuration scenario
    config.entrypointTransport.signInWithPassword = undefined;

    const result = await parseRequest(
      {
        method: 'POST',
        url: 'https://example.com/auth/signin',
        headers: {},
        cookies: {},
      },
      config
    );

    expect(result).toEqual({ kind: 'denied', code: 'INVALID_INPUT' });
  });
});

describe('parseRequest - Body Parsing and Validation', () => {
  it('parses a valid JSON string body', async () => {
    const config = createBaseConfig();
    const result = await parseRequest(
      {
        method: 'POST',
        url: 'https://example.com/auth/signin',
        headers: {},
        cookies: {},
        body: '{"username": "test", "password": "password"}',
      },
      config
    );

    expect(result).toMatchObject({
      body: { username: 'test', password: 'password' },
    });
  });

  it('accepts an already parsed object body', async () => {
    const config = createBaseConfig();
    const result = await parseRequest(
      {
        method: 'POST',
        url: 'https://example.com/auth/signin',
        headers: {},
        cookies: {},
        body: { username: 'test', password: 'password' },
      },
      config
    );

    expect(result).toMatchObject({
      body: { username: 'test', password: 'password' },
    });
  });

  it('rejects invalid JSON string body', async () => {
    const config = createBaseConfig();
    const result = await parseRequest(
      {
        method: 'POST',
        url: 'https://example.com/auth/signin',
        headers: {},
        cookies: {},
        body: '{invalid_json',
      },
      config
    );

    expect(result).toEqual({ kind: 'denied', code: 'INVALID_INPUT' });
  });

  it('rejects string body that parses to null or non-object', async () => {
    const config = createBaseConfig();

    const result1 = await parseRequest(
      {
        method: 'POST',
        url: 'https://example.com/auth/signin',
        headers: {},
        cookies: {},
        body: 'null',
      },
      config
    );
    expect(result1).toEqual({ kind: 'denied', code: 'INVALID_INPUT' });

    const result2 = await parseRequest(
      {
        method: 'POST',
        url: 'https://example.com/auth/signin',
        headers: {},
        cookies: {},
        body: '"string_value"',
      },
      config
    );
    expect(result2).toEqual({ kind: 'denied', code: 'INVALID_INPUT' });
  });

  it('rejects unsupported body types like number', async () => {
    const config = createBaseConfig();
    const result = await parseRequest(
      {
        method: 'POST',
        url: 'https://example.com/auth/signin',
        headers: {},
        cookies: {},
        body: 12345,
      },
      config
    );

    expect(result).toEqual({ kind: 'denied', code: 'INVALID_INPUT' });
  });
});

describe('parseRequest - Action-Specific Body Requirements', () => {
  it('validates startOAuth requirements', async () => {
    const config = createBaseConfig();

    // Missing provider
    const result1 = await parseRequest(
      {
        method: 'POST',
        url: 'https://example.com/auth/oauth/start',
        headers: {},
        cookies: {},
        body: {},
      },
      config
    );
    expect(result1).toEqual({ kind: 'denied', code: 'INVALID_INPUT' });

    // Valid provider, valid relative redirect
    const result2 = await parseRequest(
      {
        method: 'POST',
        url: 'https://example.com/auth/oauth/start',
        headers: {},
        cookies: {},
        body: { provider: 'google', redirectTo: '/dashboard' },
      },
      config
    );
    expect(result2).toMatchObject({ action: 'startOAuth' });

    // Invalid redirect (absolute URL)
    const result3 = await parseRequest(
      {
        method: 'POST',
        url: 'https://example.com/auth/oauth/start',
        headers: {},
        cookies: {},
        body: { provider: 'google', redirectTo: 'https://evil.com/dashboard' },
      },
      config
    );
    expect(result3).toEqual({ kind: 'denied', code: 'INVALID_INPUT' });

    // Invalid redirect (protocol relative)
    const result4 = await parseRequest(
      {
        method: 'POST',
        url: 'https://example.com/auth/oauth/start',
        headers: {},
        cookies: {},
        body: { provider: 'google', redirectTo: '//evil.com/dashboard' },
      },
      config
    );
    expect(result4).toEqual({ kind: 'denied', code: 'INVALID_INPUT' });
  });

  it('validates finishOAuth requirements', async () => {
    const config = createBaseConfig();

    const validBody = { provider: 'google', code: 'auth_code', state: 'state_xyz' };

    // Missing code
    const result1 = await parseRequest(
      {
        method: 'POST',
        url: 'https://example.com/auth/oauth/finish',
        headers: {},
        cookies: {},
        body: { provider: 'google', state: 'state_xyz' },
      },
      config
    );
    expect(result1).toEqual({ kind: 'denied', code: 'INVALID_INPUT' });

    // Valid
    const result2 = await parseRequest(
      {
        method: 'POST',
        url: 'https://example.com/auth/oauth/finish',
        headers: {},
        cookies: {},
        body: validBody,
      },
      config
    );
    expect(result2).toMatchObject({ action: 'finishOAuth', body: validBody });
  });

  it('validates requestPasswordReset requirements', async () => {
    const config = createBaseConfig();

    const result1 = await parseRequest(
      {
        method: 'POST',
        url: 'https://example.com/auth/password-reset/request',
        headers: {},
        cookies: {},
        body: {},
      },
      config
    );
    expect(result1).toEqual({ kind: 'denied', code: 'INVALID_INPUT' });

    const result2 = await parseRequest(
      {
        method: 'POST',
        url: 'https://example.com/auth/password-reset/request',
        headers: {},
        cookies: {},
        body: { email: 'test@example.com' },
      },
      config
    );
    expect(result2).toMatchObject({ action: 'requestPasswordReset' });
  });

  it('validates resetPassword requirements', async () => {
    const config = createBaseConfig();

    const result1 = await parseRequest(
      {
        method: 'POST',
        url: 'https://example.com/auth/password-reset/reset',
        headers: {},
        cookies: {},
        body: { resetToken: 'token_123' }, // missing password
      },
      config
    );
    expect(result1).toEqual({ kind: 'denied', code: 'INVALID_INPUT' });

    const result2 = await parseRequest(
      {
        method: 'POST',
        url: 'https://example.com/auth/password-reset/reset',
        headers: {},
        cookies: {},
        body: { resetToken: 'token_123', password: 'new_password' },
      },
      config
    );
    expect(result2).toMatchObject({ action: 'resetPassword' });
  });

  it('validates requestEmailVerification requirements', async () => {
    const config = createBaseConfig();

    const result1 = await parseRequest(
      {
        method: 'POST',
        url: 'https://example.com/auth/email-verification/request',
        headers: {},
        cookies: {},
        body: { email: '  ' }, // empty string after trim
      },
      config
    );
    expect(result1).toEqual({ kind: 'denied', code: 'INVALID_INPUT' });

    const result2 = await parseRequest(
      {
        method: 'POST',
        url: 'https://example.com/auth/email-verification/request',
        headers: {},
        cookies: {},
        body: { email: 'test@example.com' },
      },
      config
    );
    expect(result2).toMatchObject({ action: 'requestEmailVerification' });
  });

  it('validates verifyEmail requirements', async () => {
    const config = createBaseConfig();

    const result1 = await parseRequest(
      {
        method: 'POST',
        url: 'https://example.com/auth/email-verification/verify',
        headers: {},
        cookies: {},
        body: {},
      },
      config
    );
    expect(result1).toEqual({ kind: 'denied', code: 'INVALID_INPUT' });

    const result2 = await parseRequest(
      {
        method: 'POST',
        url: 'https://example.com/auth/email-verification/verify',
        headers: {},
        cookies: {},
        body: { verificationToken: 'token_abc' },
      },
      config
    );
    expect(result2).toMatchObject({ action: 'verifyEmail' });
  });
});
