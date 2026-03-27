import { describe, expect, it } from 'vitest';
import { createNodeRuntimeAdapter } from './node-runtime-adapter.js';
import { type AuthConfig } from '@authia/contracts';

describe('isRelativeRedirect security', () => {
  const config: AuthConfig = {
    sessionTransportMode: 'both',
    entrypointMethods: {
      startOAuth: 'POST',
    },
    entrypointPaths: {
      startOAuth: '/auth/oauth/start',
    },
    entrypointTransport: {
      startOAuth: 'cookie',
    },
    policies: [],
    runtimeAdapter: 'node',
    storageAdapter: 'postgres',
    cryptoProvider: 'default',
    plugins: ['oauth'],
    publicOrigin: 'https://example.com',
    trustedForwardedHeaders: [],
    cookieOptions: {
      secure: true,
      sameSite: 'lax',
      path: '/',
      httpOnly: true
    },
    sessionCookieName: 'auth_session'
  };

  const adapter = createNodeRuntimeAdapter(config);

  const testRedirect = async (redirectTo: string) => {
    return await adapter.parseRequest({
      method: 'POST',
      url: 'https://example.com/auth/oauth/start',
      headers: {},
      cookies: {},
      body: {
        provider: 'github',
        redirectTo
      }
    });
  };

  it('allows safe relative redirects', async () => {
    expect(await testRedirect('/')).not.toEqual({ kind: 'denied', code: 'INVALID_INPUT' });
    expect(await testRedirect('/dashboard')).not.toEqual({ kind: 'denied', code: 'INVALID_INPUT' });
    expect(await testRedirect('/foo?bar=baz')).not.toEqual({ kind: 'denied', code: 'INVALID_INPUT' });
  });

  it('rejects protocol-relative redirects', async () => {
    expect(await testRedirect('//google.com')).toEqual({ kind: 'denied', code: 'INVALID_INPUT' });
  });

  it('rejects backslash redirects (Chrome/Safari behavior)', async () => {
    expect(await testRedirect('/\\google.com')).toEqual({ kind: 'denied', code: 'INVALID_INPUT' });
    expect(await testRedirect('/\\/google.com')).toEqual({ kind: 'denied', code: 'INVALID_INPUT' });
  });

  it('rejects absolute URLs', async () => {
    expect(await testRedirect('http://google.com')).toEqual({ kind: 'denied', code: 'INVALID_INPUT' });
    expect(await testRedirect('https://google.com')).toEqual({ kind: 'denied', code: 'INVALID_INPUT' });
    expect(await testRedirect('javascript:alert(1)')).toEqual({ kind: 'denied', code: 'INVALID_INPUT' });
  });
});
