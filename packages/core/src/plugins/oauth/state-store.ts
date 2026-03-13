import type { PluginServices } from '@authia/contracts';

export function createOAuthStateStore(services: Pick<PluginServices, 'oauthStateStore'>): PluginServices['oauthStateStore'] {
  return {
    create: (input) => services.oauthStateStore.create(input),
    consume: (input) => services.oauthStateStore.consume(input)
  };
}