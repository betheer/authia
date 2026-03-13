# Password Reset Slice Audit (2026-03-13)

## Scope

- Contracts: new actions + request body/storage surfaces for password reset
- Core: email/password plugin flows for `requestPasswordReset` and `resetPassword`
- Runtime adapters: strict payload parsing for new actions (node/bun/deno)
- Storage: `password_reset_tokens` schema + repository + wiring
- Startup validation: paired optional route checks for password-reset actions

## Implemented behavior

- Added actions:
  - `requestPasswordReset`
  - `resetPassword`
- `requestPasswordReset`:
  - validates and normalizes email
  - returns generic success regardless of user existence (no account enumeration)
  - when identity exists, creates one-time password reset token record with TTL
- `resetPassword`:
  - validates reset token + password
  - atomically consumes reset token (single-use, expiry checked)
  - hashes new password and updates identity password hash
  - revokes all active sessions for the user after password change

## Security checks

- Generic success outcome for reset request protects against user discovery.
- Reset tokens are stored as derived token hashes, not raw tokens.
- Token consume operation is atomic and one-time.
- Expired/consumed tokens are rejected as invalid input.
- Password reset completion revokes all existing sessions to prevent stale-session abuse.

## Verification evidence

- Targeted tests: pass
  - contracts smoke
  - email-password plugin tests
  - startup validation tests
  - node/bun/deno runtime adapter tests
  - password reset repository tests
- Full verification: pass
  - `npm run typecheck`
  - `npm run build`
  - `npm run test` (`364 passed`, `48 skipped` DB-gated suites)

## Residual risk / next slice

- Delivery of reset links (email provider integration) is still out of scope for this slice.
- Next recommended lifecycle increment: verification-email flow with token issuance/consume and verified-identity state tracking.
