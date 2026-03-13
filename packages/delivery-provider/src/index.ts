export * from './types.js';
export { mapHttpFailure, mapSmtpFailure, mapTransportFailure } from './errors.js';
export { createHttpProvider } from './http/http-provider.js';
export { createSmtpProvider } from './smtp/smtp-provider.js';
export type { HttpConfig } from './http/http-provider.js';
export type { SmtpConfig } from './smtp/smtp-provider.js';

import { executeWithPolicy } from './policy/execute-with-policy.js';
import type { DeliveryProvider, DeliveryTelemetry, DeliveryTransport, ExecuteWithPolicyInput, PolicyConfig } from './types.js';

export function createResilientDeliveryProvider(input: {
  channel: ExecuteWithPolicyInput['channel'];
  transport: DeliveryTransport;
  policy: PolicyConfig;
  telemetry?: DeliveryTelemetry;
  sleep?: ExecuteWithPolicyInput['sleep'];
}): DeliveryProvider {
  return {
    send: async (message) =>
      executeWithPolicy({
        channel: input.channel,
        run: async () => {
          await input.transport.deliver(message);
        },
        telemetry: input.telemetry,
        sleep: input.sleep,
        maxRetries: input.policy.maxRetries,
        backoffMs: input.policy.backoffMs,
        timeoutMs: input.policy.timeoutMs
      })
  };
}
