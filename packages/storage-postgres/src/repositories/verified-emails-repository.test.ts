import { describe, expect, it, vi } from 'vitest';
import type { DatabaseClient } from '../database.js';
import { createVerifiedEmailsRepository } from './verified-emails-repository.js';

describe('verified emails repository', () => {
  it('marks and finds verified email records', async () => {
    const row = {
      normalized_email: 'user@example.com',
      verified_at: '2025-01-01T00:00:00.000Z'
    };
    const query = vi.fn().mockResolvedValueOnce({ rows: [row] }).mockResolvedValueOnce({ rows: [row] });
    const client = { query } as unknown as DatabaseClient;
    const repo = createVerifiedEmailsRepository(client);
    if (!repo) {
      throw new Error('Verified email repository is unavailable.');
    }

    const marked = await repo.markVerified('user@example.com', row.verified_at);
    expect(marked).toEqual({
      normalizedEmail: 'user@example.com',
      verifiedAt: '2025-01-01T00:00:00.000Z'
    });

    const found = await repo.find('user@example.com');
    expect(found).toEqual({
      normalizedEmail: 'user@example.com',
      verifiedAt: '2025-01-01T00:00:00.000Z'
    });
  });
});
