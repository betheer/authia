import type { AuthValue, TransactionalStorage, VerifiedEmailRecord } from '@authia/contracts';
import type { DatabaseClient } from '../database.js';
import { storageUnavailable } from '../database.js';

type VerifiedEmailRow = {
  normalized_email: string;
  verified_at: string;
};

export function createVerifiedEmailsRepository(client: DatabaseClient): TransactionalStorage['verifiedEmails'] {
  return {
    markVerified: async (normalizedEmail: string, verifiedAt: string): Promise<AuthValue<VerifiedEmailRecord>> => {
      try {
        const result = await client.query<VerifiedEmailRow>(
          `INSERT INTO verified_emails (normalized_email, verified_at)
           VALUES ($1, $2)
           ON CONFLICT (normalized_email)
           DO UPDATE SET verified_at = EXCLUDED.verified_at
           RETURNING *`,
          [normalizedEmail, verifiedAt]
        );

        return {
          normalizedEmail: result.rows[0].normalized_email,
          verifiedAt: result.rows[0].verified_at
        };
      } catch (error) {
        return storageUnavailable('Failed to mark email as verified', error);
      }
    },
    find: async (normalizedEmail: string): Promise<AuthValue<VerifiedEmailRecord | null>> => {
      try {
        const result = await client.query<VerifiedEmailRow>(
          'SELECT * FROM verified_emails WHERE normalized_email = $1',
          [normalizedEmail]
        );
        if (result.rows.length === 0) {
          return null;
        }
        return {
          normalizedEmail: result.rows[0].normalized_email,
          verifiedAt: result.rows[0].verified_at
        };
      } catch (error) {
        return storageUnavailable('Failed to find verified email', error);
      }
    }
  };
}
