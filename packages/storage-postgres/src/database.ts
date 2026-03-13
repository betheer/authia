import pg from 'pg';
import type { AuthError } from '@authia/contracts';

export type DatabaseClient = pg.PoolClient | pg.Pool;

const poolCache = new Map<string, pg.Pool>();

export function createPool(connectionString: string): pg.Pool {
  let pool = poolCache.get(connectionString);
  if (!pool) {
    pool = new pg.Pool({ connectionString });
    poolCache.set(connectionString, pool);
  }
  return pool;
}

export function storageUnavailable(message: string, cause?: unknown): AuthError {
  return {
    category: 'infrastructure',
    code: 'STORAGE_UNAVAILABLE',
    message: cause instanceof Error ? `${message}: ${cause.message}` : message,
    retryable: false
  };
}

export function duplicateIdentity(): AuthError {
  return {
    category: 'infrastructure',
    code: 'DUPLICATE_IDENTITY',
    message: 'Identity with this normalized email already exists',
    retryable: false
  };
}

export function isDuplicateKeyError(error: unknown): boolean {
  return error instanceof Error && 
         'code' in error && 
         error.code === '23505'; // PostgreSQL unique violation
}
