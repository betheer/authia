import type { AuthConfig, RuntimeAdapter } from '@authia/contracts';
import { applyResult } from './apply-result.js';
import { parseRequest } from './parse-request.js';
import { validateDenoConfig } from './validate-deno-config.js';

export function createDenoRuntimeAdapter(
  config: Pick<
    AuthConfig,
    'entrypointMethods' | 'entrypointPaths' | 'entrypointTransport' | 'sessionCookieName' | 'publicOrigin' | 'trustedForwardedHeaders'
  >
): RuntimeAdapter {
  const validation = validateDenoConfig(config);
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


