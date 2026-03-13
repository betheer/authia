import { describe, it, expect } from 'vitest';
import { duplicateIdentity } from './database.js';
import type { AuthError } from '@authia/contracts';

describe('duplicateIdentity', () => {
  it('should return a type-safe error object without any type escape', () => {
    const error = duplicateIdentity();
    
    // Should be a valid object
    expect(error).toBeDefined();
    expect(typeof error).toBe('object');
    
    // Should have required AuthError fields
    expect(error.category).toBe('infrastructure');
    expect(error.code).toBe('DUPLICATE_IDENTITY');
    expect(error.message).toContain('Identity');
    expect(error.retryable).toBe(false);
    
    // Type check: this should not require 'as any' or similar escape
    const typedError: AuthError = error;
    expect(typedError).toBe(error);
  });
});
