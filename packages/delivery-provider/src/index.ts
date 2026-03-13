export * from './types.js';
export { mapHttpFailure, mapSmtpFailure, mapTransportFailure } from './errors.js';

export function createResilientDeliveryProvider() {
  throw new Error('Not implemented');
}
