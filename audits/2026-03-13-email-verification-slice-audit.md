# Email Verification Slice Audit (2026-03-13)

## Scope

- Contracts: `requestEmailVerification` + `verifyEmail` action surfaces
- Core plugin: email verification request/consume flow in email-password plugin
- Runtime parsing: node/bun/deno strict payload support
- Storage: verification token + verified-email repositories and schema
- Startup validation: paired optional-route invariants for verification actions

## Implemented behavior

- Added actions:
  - `requestEmailVerification`
  - `verifyEmail`
- `requestEmailVerification`:
  - validates and normalizes email input
  - returns generic success even when identity does not exist (anti-enumeration)
  - skips token creation when email is already verified
  - creates one-time verification token hash with TTL when verification is needed
- `verifyEmail`:
  - validates token input
  - atomically consumes verification token (single-use + expiry)
  - marks normalized email as verified (upsert)

## Storage changes

- New tables:
  - `email_verification_tokens`
  - `verified_emails`
- Schema compatibility checks updated accordingly.
- New repositories:
  - `email-verification-tokens-repository`
  - `verified-emails-repository`
- Wired in both pool-backed and transactional storage construction paths.

## Security checks

- No account enumeration through verification-request endpoint.
- Verification tokens stored by derived hash only.
- Token consume is atomic and one-time.
- Expired or already-consumed tokens are rejected with generic invalid input.

## Verification evidence

- Targeted tests: pass
  - contracts smoke
  - email-password plugin tests
  - startup validation tests
  - node/bun/deno runtime adapter tests
  - new verification repositories tests
- Full verification: pass
  - `npm run typecheck`
  - `npm run build`
  - `npm run test` (`394 passed`, `48 skipped`)

## Next recommended increment

- Add external verification delivery integration (email transport + template flow) and integration tests that validate end-to-end delivery-to-consume behavior with deterministic test doubles.
