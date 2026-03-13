import type {
  AuthValue,
  PasswordResetToken,
  PasswordResetTokenCreateInput,
  TransactionalStorage
} from '@authia/contracts';
import { randomUUID } from 'node:crypto';
import type { DatabaseClient } from '../database.js';
import { storageUnavailable } from '../database.js';

type PasswordResetTokenRow = {
  id: string;
  token_hash: string;
  normalized_email: string;
  expires_at: string;
  consumed_at: string | null;
};

export function createPasswordResetTokensRepository(
  client: DatabaseClient
): TransactionalStorage['passwordResetTokens'] {
  return {
    create: async (input: PasswordResetTokenCreateInput): Promise<AuthValue<PasswordResetToken>> => {
      try {
        const id = randomUUID();
        const result = await client.query<PasswordResetTokenRow>(
          `INSERT INTO password_reset_tokens (id, token_hash, normalized_email, expires_at, consumed_at)
           VALUES ($1, $2, $3, $4, NULL)
           RETURNING *`,
          [id, input.tokenHash, input.normalizedEmail, input.expiresAt]
        );

        const row = result.rows[0];
        return {
          id: row.id,
          tokenHash: row.token_hash,
          normalizedEmail: row.normalized_email,
          expiresAt: row.expires_at,
          consumedAt: row.consumed_at
        };
      } catch (error) {
        return storageUnavailable('Failed to create password reset token', error);
      }
    },
    consume: async (input) => {
      try {
        const result = await client.query<{ normalized_email: string }>(
          `UPDATE password_reset_tokens
           SET consumed_at = $2
           WHERE token_hash = $1
             AND consumed_at IS NULL
             AND expires_at > $2
           RETURNING normalized_email`,
          [input.tokenHash, input.nowIso]
        );

        if (result.rows.length === 0) {
          return null;
        }

        return { normalizedEmail: result.rows[0].normalized_email };
      } catch (error) {
        return storageUnavailable('Failed to consume password reset token', error);
      }
    }
  };
}
