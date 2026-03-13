import type { AuthValue, PluginServices } from '@authia/contracts';

export type OutboundEmailMessage = {
  to: string;
  subject: string;
  text: string;
};

export type OutboundEmailProvider = {
  send: (message: OutboundEmailMessage) => Promise<AuthValue<void>>;
};

export function createEmailDeliveryFromProvider(input: {
  provider: OutboundEmailProvider;
  passwordResetUrl: (token: string) => string;
  emailVerificationUrl: (token: string) => string;
}): NonNullable<PluginServices['emailDelivery']> {
  return {
    sendPasswordReset: async ({ email, resetToken }) => {
      const resetUrl = input.passwordResetUrl(resetToken);
      return input.provider.send({
        to: email,
        subject: 'Reset your password',
        text: `Reset your password using this link: ${resetUrl}`
      });
    },
    sendEmailVerification: async ({ email, verificationToken }) => {
      const verifyUrl = input.emailVerificationUrl(verificationToken);
      return input.provider.send({
        to: email,
        subject: 'Verify your email address',
        text: `Verify your email address using this link: ${verifyUrl}`
      });
    }
  };
}
