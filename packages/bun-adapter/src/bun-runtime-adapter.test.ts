import type { AuthConfig } from '@authia/contracts';
import { describe, expect, it } from 'vitest';

import { applyResult } from './apply-result.js';
import { createBunRuntimeAdapter } from './bun-runtime-adapter.js';

describe('createBunRuntimeAdapter', () => {
  it('maps result objects into runtime responses', async () => {
    const success = await applyResult({
      kind: 'success',
      action: 'getSession',
      subject: { id: 'u1', createdAt: '2025-01-01T00:00:00.000Z' },
      session: {
        id: 's1',
        userId: 'u1',
        currentTokenId: 't1',
        currentTokenVerifier: 'v1',
        lastRotatedAt: '2025-01-01T00:00:00.000Z',
        expiresAt: '2025-02-01T00:00:00.000Z',
        idleExpiresAt: '2025-01-02T00:00:00.000Z'
      }
    });
    const redirectUnsupported = await applyResult(
      {
        kind: 'redirect',
        responseMutations: { redirectTo: '/signin' }
      },
      { redirects: false }
    );

    expect(success).toMatchObject({ status: 200 });
    expect(redirectUnsupported).toMatchObject({ category: 'infrastructure', code: 'RUNTIME_MISCONFIGURED' });
  });
});
