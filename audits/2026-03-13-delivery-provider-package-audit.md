# Delivery Provider Package Audit (2026-03-13)

## Scope

- Wire `examples\cycle2-compose.ts` through `@authia/delivery-provider`
- Preserve Cycle 2 reference-app delivery behavior for:
  - `getDeliveries()`
  - `getOutboundMessages()`
  - `deliveryMode` values `success`, `transport-failure`, and `disabled`
- Keep `createEmailDeliveryFromProvider(...)` as the core integration boundary
- Expand package-level and integration coverage around the wiring seam

## Security checks

- Confirmed the reference composition still routes all lifecycle email text generation through `createEmailDeliveryFromProvider(...)`, so token-bearing URLs stay centralized in core.
- Confirmed transport failures now enter the delivery-provider retry/error-mapping boundary instead of hand-built ad-hoc provider errors.
- Kept `deliveryMode: 'disabled'` as an explicit no-op path with no outbound capture, preserving anti-enumeration-friendly success behavior for lifecycle requests.
- Added retry/mapping seam coverage that verifies transport errors are normalized without leaking success on failure.
- Preserved deterministic integration skip behavior when `TEST_DATABASE_URL` is unset via existing `describe.skipIf(shouldSkip)` gating.

## Verification evidence

### Targeted TDD cycle

- `npm run test -- packages/delivery-provider/src/index.test.ts tests/integration/cycle2-account-lifecycle-reference-flow.test.ts`
  - Initial result: package seam tests failed with `Error: Not implemented`; integration suite skipped without `TEST_DATABASE_URL`
  - Final result: package seam tests passed; integration suite still skipped cleanly without `TEST_DATABASE_URL`

### Full repository verification

- `npm run typecheck` ✅
- `npm run build` ✅
- `npm run test` ✅
  - Summary: `448 passed | 52 skipped`
  - File summary: `57 passed | 5 skipped`

## Residual risks

- The reference composition uses an in-memory fake transport, so this slice does not exercise a real SMTP or HTTP provider end-to-end.
- Cycle 2 integration assertions remain partially environment-dependent because the database-backed suite intentionally skips when `TEST_DATABASE_URL` is missing.
- The resilient provider is currently wired only in the reference composition; future production compositions still need explicit adoption and provider-specific telemetry choices.
