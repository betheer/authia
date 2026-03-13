import type { TransactionalStorage } from '@authia/contracts';
import { storageUnavailable } from '../database.js';

export function createOAuthStatesStubRepository(): TransactionalStorage['oauthStates'] {
  return {
    create: async () =>
      storageUnavailable('OAuth state repository is not implemented for this storage adapter version.'),
    consume: async () =>
      storageUnavailable('OAuth state repository is not implemented for this storage adapter version.')
  };
}

export function createOAuthIdentitiesStubRepository(): TransactionalStorage['oauthIdentities'] {
  return {
    create: async () =>
      storageUnavailable('OAuth identity repository is not implemented for this storage adapter version.'),
    findByProviderSubject: async () =>
      storageUnavailable('OAuth identity repository is not implemented for this storage adapter version.')
  };
}
