# Cycle 2 Design: OAuth Provider Support

## Problem statement

Cycle 1 delivers a secure local email/password core. The next high-value expansion is OAuth sign-in while preserving the same security boundaries: explicit startup validation, deterministic action ownership, and testable runtime behavior.

This design scopes OAuth to a minimal provider-agnostic core (authorization start + callback completion) without adding account dashboard, social profile sync, or provider-specific SDK lock-in.

## Goals

- Add OAuth sign-in as a first-class plugin capability.
- Preserve existing kernel ownership and policy model.
- Keep runtime adapter and storage boundaries intact.
- Maintain explicit failure modes (`denied`, `unauthenticated`, `AuthError`).
- Enable provider onboarding through configuration, not new kernel branches.

## Non-goals

- No UI/dashboard account linking management.
- No refresh token persistence for external providers in this slice.
- No provider-specific SDK wrappers in core packages.
- No changes to Cycle 1 entrypoint semantics outside OAuth actions.

## Approaches considered

### A) OAuth as dedicated plugin actions (recommended)

Add new actions owned by a new OAuth plugin, while keeping kernel generic.

Pros:
- Fits existing ownership/dispatch model directly.
- Minimal kernel changes; plugin remains the behavior owner.
- Easiest to test with current runtime integration harness.

Cons:
- Introduces additional plugin complexity and action validation rules.

### B) OAuth as kernel-native built-ins

Hardcode OAuth lifecycle in kernel similar to session built-ins.

Pros:
- Centralized behavior.

Cons:
- Blurs kernel responsibilities and increases coupling.
- Makes future auth methods harder to isolate.

### C) OAuth as external pre-auth service

Handle OAuth fully outside Authia, only mint Authia sessions after callback.

Pros:
- Small Authia code changes.

Cons:
- Weakens consistency and startup validation guarantees.
- Splits security model between systems.

**Recommendation:** Approach A.

## Proposed architecture

### New supported actions

- `startOAuth` (state generation + redirect)
- `completeOAuth` (state/code validation + subject resolution + session issuance)

These actions are plugin-owned (not kernel built-ins).

### Explicit unit contracts

`state-store.ts`

- `create(input: { providerId: string; stateHash: string; codeVerifierHash: string; redirectUriHash: string; expiresAt: string }): Promise<AuthValue<void>>`
- `consume(input: { providerId: string; stateHash: string; nowIso: string }): Promise<AuthValue<{ codeVerifierHash: string; redirectUriHash: string } | null>>`
- `consume(...)` is atomic and one-time: returns `null` when missing, expired, or already consumed.

`provider-client.ts`

- `buildAuthorizationUrl(input: { providerId: string; redirectUri: string; state: string; codeChallenge: string }): AuthValue<string>`
- `exchangeCode(input: { providerId: string; code: string; redirectUri: string; codeVerifier: string }): Promise<AuthValue<{ providerSubject: string }>>`
- Provider rejection (`invalid_grant`, denied consent) maps to `unauthenticated(INVALID_CREDENTIALS)`.
- Provider transport failure/timeout maps to `AuthError(STORAGE_UNAVAILABLE)` until dedicated provider infra code is introduced.

### New plugin package

`packages/core/src/plugins/oauth/`:

- `plugin.ts` - action dispatch + config validation
- `state-store.ts` - short-lived state nonce persistence abstraction
- `provider-client.ts` - provider exchange abstraction (code -> external subject)

### Storage additions (Cycle 2 minimal)

Extend storage interfaces with:

- `oauth_states` table (state nonce, provider, redirect_uri hash, expiry, consumed_at)
- `oauth_identities` table (provider, provider_subject, user_id, unique composite)

Rules:
- state is one-time use
- state expiry enforced server-side
- callback consumes state atomically
- oauth identity uniqueness is `(provider, provider_subject)` globally
- callback links to existing row when present, otherwise creates a new user + mapping in one transaction
- if identity creation unique check collides after provider exchange, callback retries lookup once and uses the canonical row

### Runtime behavior

- `startOAuth` returns `redirect` result to provider authorization endpoint.
- `completeOAuth` returns:
  - `success` with issued session on success
  - `denied(INVALID_INPUT)` for malformed callback input/state mismatch
  - `unauthenticated(INVALID_CREDENTIALS)` for provider rejection
  - `AuthError(STORAGE_UNAVAILABLE|CRYPTO_FAILURE)` for infra failures

`startOAuth` failure mapping:

- malformed provider id / callback parameters -> `denied(INVALID_INPUT)`
- unknown provider config -> `denied(INVALID_INPUT)`
- state persistence failure -> `AuthError(STORAGE_UNAVAILABLE)`
- URL composition/crypto failure -> `AuthError(CRYPTO_FAILURE)`

## Data flow

1. Client calls `startOAuth`.
2. Plugin creates signed state nonce + stores one-time state record.
3. Plugin returns redirect to provider auth URL with state.
4. Provider redirects user to callback with `code` + `state`.
5. Client calls `completeOAuth`.
6. Plugin verifies state (exists, unexpired, unused, expected provider).
7. Plugin exchanges `code` with provider adapter to obtain stable provider subject.
8. Plugin resolves or creates local user identity mapping.
9. Plugin issues Authia session through existing session layer.

Identity resolution policy:

- If `(provider, providerSubject)` exists: load mapped `user_id`, issue session.
- If absent: create user and mapping transactionally, then issue session.
- No email-based auto-linking in this slice (prevents account takeover by unverified provider email claims).

## Error handling and security controls

- Strict one-time state consumption prevents replay.
- Short TTL state records (e.g., 5 minutes) with explicit expiry check.
- Provider subject uniqueness enforced at DB layer.
- All callback inputs validated structurally before provider exchange.
- Redirect handling gated by runtime redirect capability (existing invariant).
- No broad catches with silent fallbacks; all failures map to explicit outcomes.

## Startup validation changes

Extend startup validator with OAuth invariants:

- provider config completeness (client id, auth/token endpoints, callback path)
- callback entrypoint path uniqueness globally across all actions (`method:path` pair)
- OAuth actions must have exactly one owner
- runtime redirect capability required when OAuth plugin active
- PKCE required for every provider (`S256` only in this slice)

## Testing strategy

- Unit tests for OAuth plugin input validation/state handling.
- Storage tests for one-time state consume semantics.
- Kernel/startup tests for ownership and redirect-capability checks with OAuth enabled.
- Integration tests:
  - start flow redirect success
  - callback success creates/fetches identity and issues session
  - replayed state denied
  - expired state denied
  - provider exchange failure maps correctly
  - storage outage paths for start/complete

## Rollout slices

1. Contracts + startup validation extensions.
2. Storage schema + repositories for OAuth state/identity.
3. OAuth plugin core flow with provider adapter abstraction.
4. Integration release-gate suite with mock provider exchange.

## Open decisions intentionally deferred (non-blocking for Cycle 2 slice 1)

- Multi-tenant provider configuration strategy.
- Provider-specific profile claims normalization.
- External refresh token storage/rotation.

## Success criteria

- OAuth flows pass all release-gate scenarios.
- Existing Cycle 1 tests remain green.
- `npm run test && npm run typecheck && npm run build` pass.
- Final audit confirms no security regression versus Cycle 1 baseline.
