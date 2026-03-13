# Delivery Transport Cleanup Design

## Context
- `DeliveryTransport` lacks a lifecycle hook, so transports with persistent connections (SMTP/nodemailer) cannot release resources.
- Issue raised on `feat-delivery-provider-package`: SMTP transports keep sockets open, creating a resource leak under load.
- Requirement: extend the transport contract with optional cleanup and implement it for transports that need it without breaking existing consumers.

## Goals
1. Provide an optional cleanup API on `DeliveryTransport` so callers can close transports when appropriate.
2. Implement lifecycle handling for the SMTP transport by delegating to `nodemailer` when it exposes `close`.
3. Keep the HTTP transport compatible by allowing a no-op close or omitting it entirely.
4. Add automated tests that verify the SMTP provider delegates to the underlying transport’s `close`.

## Non-Goals
- Changing `DeliveryProvider.send` semantics or telemetry/policy flows.
- Implementing connection pooling or auto-shutdown logic for transports.
- Introducing new delivery transports.

## Assumptions & Constraints
- Callers control when to dispose transports; adding `close` must be purely additive/optional.
- `nodemailer` transports may or may not expose a `close` function, so implementation must feature-detect at runtime.
- HTTP transport remains stateless and does not need cleanup logic beyond the optional signature.

## Approach Options
1. **Extend `DeliveryTransport` with `close?: () => Promise<void> | void`.**  
   Pros: Minimal API change, empowers callers to manage lifecycle, straightforward to implement for SMTP.  
   Cons: Requires updating every provider definition to include the optional field, even when unused.
2. **Introduce a separate `DeliveryTransportWithCleanup` subtype and cast at call sites.**  
   Pros: Limits API churn to transports needing cleanup.  
   Cons: Complicates typing and requires conditional type guards wherever transports are used.
3. **Create an external transport registry that tracks cleanup callbacks.**  
   Pros: Keeps transport interface unchanged.  
   Cons: Adds global mutable state and indirection, harder to reason about and test.

**Recommendation:** Option 1 — extending the core transport contract keeps lifecycle management explicit, avoids hidden registries, and stays backward-compatible because the field is optional.

## Detailed Design

### Type Updates
- Update `DeliveryTransport` in `packages/delivery-provider/src/types.ts` to include an optional `close` method returning `void` or `Promise<void>`.
- Document that implementations may omit `close`, and callers should check for its presence before invoking.
- Contract: callers must treat `close` as best-effort cleanup — any rejection is propagated so shutdown orchestration can log/fail fast. Implementers must not swallow errors silently.

### SMTP Provider
- Update the `NodemailerTransport` type to include an optional `close?: () => Promise<void> | void`.
- When creating the provider, return an object with:
  - `deliver` (unchanged) delegating to `transport.sendMail`.
  - `close` that checks whether `transport.close` is a function and, if so, awaits its result. If the transport rejects, surface the rejection back to the caller so the shutdown flow can diagnose failures. No additional wrapping/logging is added here.
- `close` is safe to call multiple times; each invocation feature-detects the nodemailer `close` function and awaits it. If nodemailer throws when already closed, that error propagates, signaling to the orchestrator that cleanup failed.

### HTTP Provider
- Continue returning a transport that only implements `deliver`. Since `close` is optional, no code changes are required besides updated typing in tests (if any).

### Lifecycle Integration
- Deliverability callers (policy executors, framework adapters, or applications currently instantiating transports directly) will invoke `transport.close?.()` during their shutdown hooks. This change simply makes the hook available — no automatic invocation is added, keeping current behavior backward-compatible.
- The upcoming `createResilientDeliveryProvider` factory (currently unimplemented) will own the transport instance; once implemented it can forward a `close` helper that simply delegates to the underlying transport close. Until then, userland code calling `createSmtpProvider` can dispose the transport explicitly.

### Testing Strategy
- Extend `smtp-provider.test.ts` with a case where the mock transport exposes `close`; assert that calling `provider.close?.()` invokes `transport.close`.
- Keep existing delivery tests intact to ensure behavior unaffected.
- HTTP provider test suite remains unchanged (no `close` method expected).

### Migration & Backward Compatibility
- Because `close` is optional, existing consumers/implementations continue compiling. TypeScript consumers gain a new optional method they can invoke defensively.
- No package-level breaking changes; publish as a minor release.

## Open Questions
- None; all requirements from the issue are covered. If future transports need cleanup, they can implement `close` following the same contract.
