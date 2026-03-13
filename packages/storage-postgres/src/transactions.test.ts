import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { AuthError } from '@authia/contracts';

// Mock the database module
const mockQuery = vi.fn();
const mockRelease = vi.fn();
const mockConnect = vi.fn();

vi.mock('./database.js', () => {
  return {
    createPool: vi.fn(() => ({
      connect: mockConnect
    })),
    storageUnavailable: (message: string, cause?: unknown) => ({
      category: 'infrastructure' as const,
      code: 'STORAGE_UNAVAILABLE' as const,
      message: cause instanceof Error ? `${message}: ${cause.message}` : message,
      retryable: false
    })
  };
});

describe('beginTransaction', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    
    mockQuery.mockResolvedValue({ rows: [], rowCount: 0 });
    mockRelease.mockResolvedValue(undefined);
    
    const mockClient = {
      query: mockQuery,
      release: mockRelease
    };
    
    mockConnect.mockResolvedValue(mockClient);
  });

  beforeEach(() => {
    vi.clearAllMocks();
    
    mockQuery.mockResolvedValue({ rows: [], rowCount: 0 });
    mockRelease.mockResolvedValue(undefined);
    
    const mockClient = {
      query: mockQuery,
      release: mockRelease
    };
    
    mockConnect.mockResolvedValue(mockClient);
  });

  describe('Connection failure handling', () => {
    it('should map connection acquisition failure to STORAGE_UNAVAILABLE', async () => {
      // Dynamically import after mocks are set up
      const { beginTransaction } = await import('./transactions.js');
      
      mockConnect.mockRejectedValue(new Error('Connection refused'));
      
      const result = await beginTransaction('mock-connection-string', async (tx) => {
        return { kind: 'granted' as const, value: 'success' };
      });
      
      expect(result).toMatchObject({
        category: 'infrastructure',
        code: 'STORAGE_UNAVAILABLE'
      });
    });
  });

  describe('Rollback signal handling', () => {
    it('should rollback and re-throw rollback signal object', async () => {
      // Dynamically import after mocks are set up
      const { beginTransaction } = await import('./transactions.js');
      
      mockQuery.mockResolvedValue({ rows: [], rowCount: 0 });
      
      const rollbackSignal = {
        outcome: {
          kind: 'denied' as const,
          code: 'INVALID_INPUT' as const
        }
      };
      
      await expect(
        beginTransaction('mock-connection-string', async (tx) => {
          throw rollbackSignal;
        })
      ).rejects.toEqual(rollbackSignal);
      
      // Verify ROLLBACK was called
      expect(mockQuery).toHaveBeenCalledWith('BEGIN');
      expect(mockQuery).toHaveBeenCalledWith('ROLLBACK');
      expect(mockRelease).toHaveBeenCalled();
    });

    it('should rollback and re-throw when rollback signal contains AuthError outcome', async () => {
      // Dynamically import after mocks are set up
      const { beginTransaction } = await import('./transactions.js');
      
      mockQuery.mockResolvedValue({ rows: [], rowCount: 0 });
      
      const rollbackSignal = {
        outcome: {
          category: 'infrastructure' as const,
          code: 'STORAGE_UNAVAILABLE' as const,
          message: 'Database error',
          retryable: false
        } as AuthError
      };
      
      await expect(
        beginTransaction('mock-connection-string', async (tx) => {
          throw rollbackSignal;
        })
      ).rejects.toEqual(rollbackSignal);
      
      expect(mockQuery).toHaveBeenCalledWith('ROLLBACK');
    });
  });

  describe('Non-rollback error handling', () => {
    it('should rollback and return STORAGE_UNAVAILABLE for unexpected errors', async () => {
      // Dynamically import after mocks are set up
      const { beginTransaction } = await import('./transactions.js');
      
      mockQuery.mockResolvedValue({ rows: [], rowCount: 0 });
      
      const result = await beginTransaction('mock-connection-string', async (tx) => {
        throw new Error('Unexpected error');
      });
      
      expect(result).toMatchObject({
        category: 'infrastructure',
        code: 'STORAGE_UNAVAILABLE'
      });
      
      expect(mockQuery).toHaveBeenCalledWith('ROLLBACK');
      expect(mockRelease).toHaveBeenCalled();
    });
  });

  describe('Successful transaction', () => {
    it('should commit and return result on success', async () => {
      // Dynamically import after mocks are set up
      const { beginTransaction } = await import('./transactions.js');
      
      mockQuery.mockResolvedValue({ rows: [], rowCount: 0 });
      
      const result = await beginTransaction('mock-connection-string', async (tx) => {
        return { kind: 'granted' as const, value: 'success' };
      });
      
      expect(result).toEqual({ kind: 'granted', value: 'success' });
      expect(mockQuery).toHaveBeenCalledWith('BEGIN');
      expect(mockQuery).toHaveBeenCalledWith('COMMIT');
      expect(mockRelease).toHaveBeenCalled();
    });
  });

  describe('Rollback failure handling', () => {
    it('should return STORAGE_UNAVAILABLE when ROLLBACK fails after non-rollback error', async () => {
      // Dynamically import after mocks are set up
      const { beginTransaction } = await import('./transactions.js');
      
      // First call (BEGIN) succeeds, second call (ROLLBACK) fails
      mockQuery
        .mockResolvedValueOnce({ rows: [], rowCount: 0 }) // BEGIN
        .mockRejectedValueOnce(new Error('ROLLBACK failed')); // ROLLBACK
      
      const result = await beginTransaction('mock-connection-string', async (tx) => {
        throw new Error('Unexpected error');
      });
      
      expect(result).toMatchObject({
        category: 'infrastructure',
        code: 'STORAGE_UNAVAILABLE'
      });
      
      expect(mockQuery).toHaveBeenCalledWith('BEGIN');
      expect(mockQuery).toHaveBeenCalledWith('ROLLBACK');
    });

    it('should return STORAGE_UNAVAILABLE when ROLLBACK fails after rollback signal', async () => {
      // Dynamically import after mocks are set up
      const { beginTransaction } = await import('./transactions.js');
      
      // First call (BEGIN) succeeds, second call (ROLLBACK) fails
      mockQuery
        .mockResolvedValueOnce({ rows: [], rowCount: 0 }) // BEGIN
        .mockRejectedValueOnce(new Error('ROLLBACK failed')); // ROLLBACK
      
      const rollbackSignal = {
        outcome: {
          kind: 'denied' as const,
          code: 'INVALID_INPUT' as const
        }
      };
      
      const result = await beginTransaction('mock-connection-string', async (tx) => {
        throw rollbackSignal;
      });
      
      // Rollback failure takes precedence - transaction boundary is compromised
      expect(result).toMatchObject({
        category: 'infrastructure',
        code: 'STORAGE_UNAVAILABLE'
      });
      
      expect(mockQuery).toHaveBeenCalledWith('ROLLBACK');
    });

    it('should destroy client (release with destroy flag) when ROLLBACK fails', async () => {
      // Dynamically import after mocks are set up
      const { beginTransaction } = await import('./transactions.js');
      
      // Mock client with destroy capability
      const mockClientWithDestroy = {
        query: vi.fn(),
        release: vi.fn()
      };
      
      mockClientWithDestroy.query
        .mockResolvedValueOnce({ rows: [], rowCount: 0 }) // BEGIN
        .mockRejectedValueOnce(new Error('ROLLBACK failed')); // ROLLBACK
      
      mockConnect.mockResolvedValue(mockClientWithDestroy);
      
      await beginTransaction('mock-connection-string', async (tx) => {
        throw new Error('Unexpected error');
      });
      
      // Verify client was released with destroy flag (true)
      expect(mockClientWithDestroy.release).toHaveBeenCalledWith(true);
    });

    it('should release normally when ROLLBACK succeeds after error', async () => {
      // Dynamically import after mocks are set up
      const { beginTransaction } = await import('./transactions.js');
      
      // Mock client 
      const mockClientNormalRelease = {
        query: vi.fn(),
        release: vi.fn()
      };
      
      mockClientNormalRelease.query
        .mockResolvedValueOnce({ rows: [], rowCount: 0 }) // BEGIN
        .mockResolvedValueOnce({ rows: [], rowCount: 0 }); // ROLLBACK
      
      mockConnect.mockResolvedValue(mockClientNormalRelease);
      
      await beginTransaction('mock-connection-string', async (tx) => {
        throw new Error('Unexpected error');
      });
      
      // Verify client was released without destroy flag
      expect(mockClientNormalRelease.release).toHaveBeenCalledWith();
      expect(mockClientNormalRelease.release).not.toHaveBeenCalledWith(true);
    });
  });
});
