import type { PluginServices } from '@authia/contracts';

export function createOAuthProviderClient(
  services: Pick<PluginServices, 'oauthProviderClient'>
): PluginServices['oauthProviderClient'] {
  return {
    buildAuthorizationUrl: (input) => services.oauthProviderClient.buildAuthorizationUrl(input),
    exchangeCode: (input) => services.oauthProviderClient.exchangeCode(input)
  };
}