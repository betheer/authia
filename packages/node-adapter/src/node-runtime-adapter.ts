import type { AuthConfig, RuntimeAdapter } from '@authia/contracts';
import { applyResult } from './apply-result.js';
import { parseRequest } from './parse-request.js';
import { validateNodeConfig } from './validate-node-config.js';

export function createNodeRuntimeAdapter(
  config: Pick<
    AuthConfig,
    'entrypointMethods' | 'entrypointPaths' | 'entrypointTransport' | 'sessionCookieName' | 'publicOrigin' | 'trustedForwardedHeaders'
  >
): RuntimeAdapter {
  const validation = validateNodeConfig(config);
  if (!validation.ok) {
    throw new Error(validation.message);
  }

  return {
    parseRequest: (input) => parseRequest(input, config),
    applyResult: (result) => applyResult(result, { redirects: true }),
    capabilities: () => ({
      cookies: true,
      headers: true,
      redirects: true
    })
  };
}
