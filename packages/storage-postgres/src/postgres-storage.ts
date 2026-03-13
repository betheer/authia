import type { StorageAdapter } from '@authia/contracts';
import { createPool } from './database.js';
import { ensureCompatibleSchema } from './migrations/ensure-compatible-schema.js';
import { createUsersRepository } from './repositories/users-repository.js';
import { createIdentitiesRepository } from './repositories/identities-repository.js';
import { createSessionsRepository } from './repositories/sessions-repository.js';
import { createOAuthStatesRepository } from './repositories/oauth-states-repository.js';
import { createOAuthIdentitiesRepository } from './repositories/oauth-identities-repository.js';
import { createPasswordResetTokensRepository } from './repositories/password-reset-tokens-repository.js';
import { createEmailVerificationTokensRepository } from './repositories/email-verification-tokens-repository.js';
import { createVerifiedEmailsRepository } from './repositories/verified-emails-repository.js';
import { beginTransaction } from './transactions.js';

export function createPostgresStorageAdapter(connectionString: string): StorageAdapter {
  const pool = createPool(connectionString);
  
  return {
    migrations: {
      ensureCompatibleSchema: () => ensureCompatibleSchema(pool)
    },
    users: createUsersRepository(pool),
    identities: createIdentitiesRepository(pool),
    sessions: createSessionsRepository(pool),
    oauthStates: createOAuthStatesRepository(pool),
    oauthIdentities: createOAuthIdentitiesRepository(pool),
    passwordResetTokens: createPasswordResetTokensRepository(pool),
    emailVerificationTokens: createEmailVerificationTokensRepository(pool),
    verifiedEmails: createVerifiedEmailsRepository(pool),
    beginTransaction: async (run) => beginTransaction(connectionString, run)
  };
}

export { storageUnavailable } from './database.js';

