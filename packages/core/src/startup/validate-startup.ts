import { supportedActions, type AuthConfig, type SupportedAction, type ValidationResult } from '@authia/contracts';

const builtInActions: SupportedAction[] = ['getSession', 'refreshSession', 'logout', 'logoutAll'];

export function validateStartupConfig(
  config: AuthConfig,
  pluginActions: SupportedAction[] = [],
  runtimeCapabilities: { redirects: boolean } = { redirects: false }
): ValidationResult {
  const configuredActions = supportedActions.filter(
    (action) =>
      config.entrypointMethods[action] !== undefined &&
      config.entrypointPaths[action] !== undefined &&
      config.entrypointTransport[action] !== undefined
  );

  const optionalActions: SupportedAction[] = [
    'startOAuth',
    'finishOAuth',
    'requestPasswordReset',
    'resetPassword',
    'requestEmailVerification',
    'verifyEmail'
  ];
  for (const action of optionalActions) {
    const hasMethod = config.entrypointMethods[action] !== undefined;
    const hasPath = config.entrypointPaths[action] !== undefined;
    const hasTransport = config.entrypointTransport[action] !== undefined;
    const configuredCount = [hasMethod, hasPath, hasTransport].filter(Boolean).length;
    if (configuredCount > 0 && configuredCount < 3) {
      return {
        ok: false,
        code: 'RUNTIME_MISCONFIGURED',
        message: `${action} must define method, path, and transport together.`
      };
    }
  }

  const hasOAuthConfigured = ['startOAuth', 'finishOAuth'].some((action) => configuredActions.includes(action as SupportedAction));
  const hasStartOAuthConfigured = configuredActions.includes('startOAuth');
  const hasFinishOAuthConfigured = configuredActions.includes('finishOAuth');
  if (hasStartOAuthConfigured !== hasFinishOAuthConfigured) {
    return {
      ok: false,
      code: 'RUNTIME_MISCONFIGURED',
      message: 'startOAuth and finishOAuth must be configured together.'
    };
  }
  const hasRequestPasswordResetConfigured = configuredActions.includes('requestPasswordReset');
  const hasResetPasswordConfigured = configuredActions.includes('resetPassword');
  if (hasRequestPasswordResetConfigured !== hasResetPasswordConfigured) {
    return {
      ok: false,
      code: 'RUNTIME_MISCONFIGURED',
      message: 'requestPasswordReset and resetPassword must be configured together.'
    };
  }
  const hasRequestEmailVerificationConfigured = configuredActions.includes('requestEmailVerification');
  const hasVerifyEmailConfigured = configuredActions.includes('verifyEmail');
  if (hasRequestEmailVerificationConfigured !== hasVerifyEmailConfigured) {
    return {
      ok: false,
      code: 'RUNTIME_MISCONFIGURED',
      message: 'requestEmailVerification and verifyEmail must be configured together.'
    };
  }
  if (hasOAuthConfigured) {
    const providers = config.oauthProviders;
    if (!providers || Object.keys(providers).length === 0) {
      return {
        ok: false,
        code: 'RUNTIME_MISCONFIGURED',
        message: 'OAuth actions require oauthProviders configuration.'
      };
    }
    for (const [providerId, provider] of Object.entries(providers)) {
      if (typeof provider !== 'object' || provider === null) {
        return {
          ok: false,
          code: 'RUNTIME_MISCONFIGURED',
          message: `OAuth provider ${providerId} must be an object configuration.`
        };
      }
      if (
        !provider.clientId ||
        !provider.authorizationEndpoint ||
        !provider.tokenEndpoint ||
        !provider.callbackPath
      ) {
        return {
          ok: false,
          code: 'RUNTIME_MISCONFIGURED',
          message: `OAuth provider ${providerId} is missing required configuration.`
        };
      }
      if (provider.pkceMethod !== 'S256') {
        return {
          ok: false,
          code: 'RUNTIME_MISCONFIGURED',
          message: `OAuth provider ${providerId} must use PKCE S256.`
        };
      }
    }
    const configuredEntrypointPaths = new Set(
      Object.values(config.entrypointPaths).filter((value): value is string => typeof value === 'string' && value.length > 0)
    );
    const providerCallbackPaths = new Set<string>();
    for (const [providerId, provider] of Object.entries(providers)) {
      if (configuredEntrypointPaths.has(provider.callbackPath)) {
        return {
          ok: false,
          code: 'RUNTIME_MISCONFIGURED',
          message: `OAuth provider ${providerId} callbackPath collides with an existing entrypoint path.`
        };
      }
      if (providerCallbackPaths.has(provider.callbackPath)) {
        return {
          ok: false,
          code: 'RUNTIME_MISCONFIGURED',
          message: `OAuth provider ${providerId} callbackPath collides with another provider callback.`
        };
      }
      providerCallbackPaths.add(provider.callbackPath);
    }
    if (!runtimeCapabilities.redirects) {
      return {
        ok: false,
        code: 'RUNTIME_MISCONFIGURED',
        message: 'OAuth actions require runtime redirect capability.'
      };
    }
  }

  if (!config.sessionCookieName) {
    return {
      ok: false,
      code: 'RUNTIME_MISCONFIGURED',
      message: 'sessionCookieName must be configured.'
    };
  }

  if (!config.cookieOptions.path) {
    return {
      ok: false,
      code: 'RUNTIME_MISCONFIGURED',
      message: 'cookieOptions.path must be configured.'
    };
  }

  if (config.sessionTransportMode !== 'both') {
    const mismatched = Object.values(config.entrypointTransport).some((value) => value !== config.sessionTransportMode);
    if (mismatched) {
      return {
        ok: false,
        code: 'RUNTIME_MISCONFIGURED',
        message: 'entrypoint transport must match sessionTransportMode when mode is fixed.'
      };
    }
  }

  const routeKeys = new Set<string>();
  for (const action of configuredActions) {
    const routeKey = `${config.entrypointMethods[action]}:${config.entrypointPaths[action]}`;
    if (routeKeys.has(routeKey)) {
      return {
        ok: false,
        code: 'RUNTIME_MISCONFIGURED',
        message: 'Entrypoint method/path pairs must be unique.'
      };
    }
    routeKeys.add(routeKey);
  }

  for (const action of builtInActions) {
    if (pluginActions.includes(action)) {
      return {
        ok: false,
        code: 'RUNTIME_MISCONFIGURED',
        message: `Plugin cannot own built-in action ${action}.`
      };
    }
  }

  const ownedActions = new Set<SupportedAction>(builtInActions);
  for (const action of pluginActions) {
    if (ownedActions.has(action)) {
      return {
        ok: false,
        code: 'RUNTIME_MISCONFIGURED',
        message: `Action ownership conflict detected for ${action}.`
      };
    }
    ownedActions.add(action);
  }

  for (const action of configuredActions) {
    if (!ownedActions.has(action)) {
      return {
        ok: false,
        code: 'RUNTIME_MISCONFIGURED',
        message: `Missing action owner for ${action}.`
      };
    }
  }

  const needsRedirects = config.policies.some((policy) => policy.capabilities.mayRedirect);
  if (needsRedirects && !runtimeCapabilities.redirects) {
    return {
      ok: false,
      code: 'RUNTIME_MISCONFIGURED',
      message: 'Redirect policies require runtime redirect capability.'
    };
  }

  return { ok: true };
}
