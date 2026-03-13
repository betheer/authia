# Cycle 2 Delivery Provider Boundary Audit (2026-03-13)

## Scope

- Core delivery-provider boundary for email lifecycle messages
- Reference composition wiring through provider boundary
- Lifecycle integration and behavior tests for provider modes

## Features shipped

- Added `createEmailDeliveryFromProvider(...)` in core:
  - maps `sendPasswordReset` and `sendEmailVerification` into generic provider sends
  - centralizes message subject/text creation with URL builders
  - preserves provider error propagation (`AuthError` is not swallowed)
- Exported provider boundary from `@authia/core` index.
- Updated Cycle 2 reference composition to use provider boundary:
  - captures outbound messages (`getOutboundMessages`)
  - continues exposing token-level deliveries (`getDeliveries`) derived from outbound URLs
  - supports delivery modes: `success`, `transport-failure`, `disabled`
- Expanded lifecycle integration coverage to validate:
  - reset/verification outbound link generation paths
  - disabled mode behavior (no outbound messages, request endpoints still succeed)
  - transport failure surfaced as infrastructure error

## Security and reliability checks

- Delivery failure remains explicit and observable; no silent success fallback added.
- Request endpoints keep anti-enumeration semantics (generic success path remains intact).
- Token material is still minted by crypto service and consumed atomically by existing storage logic.
- Provider boundary keeps implementation seams isolated for future SMTP/API providers.

## Verification evidence

- Full repository verification: pass
  - `npm run typecheck`
  - `npm run build`
  - `npm run test`
- Result summary:
  - `402 passed`
  - `52 skipped`

## Follow-up recommendations

- Add a production-grade provider package (SMTP/API) implementing the new boundary with retry/timeout policy.
- Introduce a dedicated delivery error code (instead of reusing `STORAGE_UNAVAILABLE`) for cleaner ops telemetry.
