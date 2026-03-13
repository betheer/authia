import { describe, expect, it, vi } from 'vitest';
import type { DatabaseClient } from '../database.js';
import { createPasswordResetTokensRepository } from './password-reset-tokens-repository.js';

describe('password reset tokens repository', () => {
  it('creates and consumes token once with atomic update', async () => {
    const nowIso = new Date().toISOString();
    const createdRow = {
      id: 'reset-id',
      token_hash: 'token-hash',
      normalized_email: 'user@example.com',
      expires_at: new Date(Date.now() + 60_000).toISOString(),
      consumed_at: null
    };

    const query = vi
      .fn()
      .mockResolvedValueOnce({ rows: [createdRow] })
      .mockResolvedValueOnce({ rows: [{ normalized_email: 'user@example.com' }] })
      .mockResolvedValueOnce({ rows: [] });

    const client = { query } as unknown as DatabaseClient;
    const repo = createPasswordResetTokensRepository(client);
    if (!repo) {
      throw new Error('Password reset token repository is unavailable.');
    }

    const created = await repo.create({
      tokenHash: 'token-hash',
      normalizedEmail: 'user@example.com',
      expiresAt: createdRow.expires_at
    });
    expect(created).toMatchObject({
      tokenHash: 'token-hash',
      normalizedEmail: 'user@example.com'
    });

    const firstConsume = await repo.consume({ tokenHash: 'token-hash', nowIso });
    expect(firstConsume).toEqual({ normalizedEmail: 'user@example.com' });

    const secondConsume = await repo.consume({ tokenHash: 'token-hash', nowIso });
    expect(secondConsume).toBeNull();
  });
});
