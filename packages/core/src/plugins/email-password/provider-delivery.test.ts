import { describe, expect, it, vi } from 'vitest';

import { createEmailDeliveryFromProvider } from './provider-delivery.js';

describe('createEmailDeliveryFromProvider', () => {
  it('maps reset and verification payloads to provider message sends', async () => {
    const provider = {
      send: vi.fn(async () => undefined)
    };
    const delivery = createEmailDeliveryFromProvider({
      provider,
      passwordResetUrl: (token) => `https://app.example/reset?token=${token}`,
      emailVerificationUrl: (token) => `https://app.example/verify?token=${token}`
    });

    await delivery.sendPasswordReset({ email: 'user@example.com', resetToken: 'reset-token' });
    await delivery.sendEmailVerification({
      email: 'user@example.com',
      verificationToken: 'verify-token'
    });

    expect(provider.send).toHaveBeenNthCalledWith(1, {
      to: 'user@example.com',
      subject: 'Reset your password',
      text: 'Reset your password using this link: https://app.example/reset?token=reset-token'
    });
    expect(provider.send).toHaveBeenNthCalledWith(2, {
      to: 'user@example.com',
      subject: 'Verify your email address',
      text: 'Verify your email address using this link: https://app.example/verify?token=verify-token'
    });
  });

  it('propagates provider transport failures without masking', async () => {
    const provider = {
      send: vi.fn(async () => ({
        category: 'infrastructure' as const,
        code: 'STORAGE_UNAVAILABLE' as const,
        message: 'smtp unavailable',
        retryable: true
      }))
    };
    const delivery = createEmailDeliveryFromProvider({
      provider,
      passwordResetUrl: (token) => `https://app.example/reset?token=${token}`,
      emailVerificationUrl: (token) => `https://app.example/verify?token=${token}`
    });

    const result = await delivery.sendPasswordReset({
      email: 'user@example.com',
      resetToken: 'token'
    });

    expect(result).toEqual({
      category: 'infrastructure',
      code: 'STORAGE_UNAVAILABLE',
      message: 'smtp unavailable',
      retryable: true
    });
  });
});
