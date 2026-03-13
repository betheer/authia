import { describe, expect, it } from 'vitest';

import { createResilientDeliveryProvider } from './index.js';

describe('delivery-provider exports', () => {
  it('exports resilient provider factory', () => {
    expect(typeof createResilientDeliveryProvider).toBe('function');
  });
});
