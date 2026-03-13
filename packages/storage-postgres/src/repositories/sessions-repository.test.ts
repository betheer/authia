import { describe, it, expect, vi } from 'vitest';
import { createSessionsRepository } from './sessions-repository.js';
import type { DatabaseClient } from '../database.js';

describe('sessions repository unit tests', () => {
  describe('update with empty patch', () => {
    it('should handle empty update input without generating invalid SQL', async () => {
      const mockQuery = vi.fn();
      const mockClient: DatabaseClient = {
        query: mockQuery
      } as any;

      const repo = createSessionsRepository(mockClient);
      
      // Empty patch should either be a no-op or return an error
      const result = await repo.update('session-123', {});
      
      // Should not throw or generate invalid SQL
      expect(result).toBeDefined();
      
      // If query was called, it should be valid SQL
      if (mockQuery.mock.calls.length > 0) {
        const sql = mockQuery.mock.calls[0][0];
        expect(sql).not.toContain('SET  WHERE'); // Invalid SQL pattern
        expect(sql).not.toContain('SET WHERE'); // Invalid SQL pattern
      }
    });
  });

  describe('compareAndSwapToken - no extra existence query', () => {
    it('should return null on CAS failure without extra existence query', async () => {
      const mockQuery = vi.fn();
      mockQuery.mockResolvedValue({ rows: [], rowCount: 0 });
      
      const mockClient: DatabaseClient = {
        query: mockQuery
      } as any;

      const repo = createSessionsRepository(mockClient);
      
      const result = await repo.compareAndSwapToken({
        sessionId: 'session-123',
        expectedTokenId: 'wrong-token',
        nextTokenId: 'new-token',
        nextTokenVerifier: 'new-verifier',
        nextLastRotatedAt: new Date().toISOString(),
        nextIdleExpiresAt: new Date().toISOString()
      });
      
      // Should return null for CAS failure
      expect(result).toBeNull();
      
      // Should only have called UPDATE, not a separate SELECT
      expect(mockQuery).toHaveBeenCalledTimes(1);
      expect(mockQuery.mock.calls[0][0]).toContain('UPDATE');
      expect(mockQuery.mock.calls[0][0]).not.toContain('SELECT');
    });

    it('should return session on successful CAS', async () => {
      const mockRow = {
        id: 'session-123',
        user_id: 'user-456',
        current_token_id: 'new-token',
        current_token_verifier: 'new-verifier',
        last_rotated_at: new Date().toISOString(),
        expires_at: new Date().toISOString(),
        idle_expires_at: new Date().toISOString(),
        revoked_at: null
      };
      
      const mockQuery = vi.fn();
      mockQuery.mockResolvedValue({ rows: [mockRow], rowCount: 1 });
      
      const mockClient: DatabaseClient = {
        query: mockQuery
      } as any;

      const repo = createSessionsRepository(mockClient);
      
      const result = await repo.compareAndSwapToken({
        sessionId: 'session-123',
        expectedTokenId: 'old-token',
        nextTokenId: 'new-token',
        nextTokenVerifier: 'new-verifier',
        nextLastRotatedAt: new Date().toISOString(),
        nextIdleExpiresAt: new Date().toISOString()
      });
      
      // Should return the session
      expect(result).not.toBeNull();
      if (result && typeof result === 'object' && 'id' in result) {
        expect(result.id).toBe('session-123');
      }
      
      // Should only have called UPDATE once
      expect(mockQuery).toHaveBeenCalledTimes(1);
    });
  });
});
