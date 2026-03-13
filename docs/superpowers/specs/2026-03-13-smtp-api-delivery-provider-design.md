# SMTP/API Delivery Provider Design (2026-03-13)

## Problem statement

Authia now has lifecycle delivery hooks and a provider-boundary helper, but still lacks a production-ready delivery package with transport behavior, retry/timeout policy, observability, and explicit error taxonomy for email delivery failures.

This spec defines a focused next slice: add a dedicated delivery-provider package that plugs into `createEmailDeliveryFromProvider(...)` and supports deterministic testing.

## Scope

### In scope

- New package: `packages/delivery-provider` (name finalization can happen during implementation planning)
- Provider interfaces and concrete transport implementations for:
  - SMTP transport
  - HTTP API transport
- Shared delivery error mapping with dedicated delivery error code(s)
- Timeout and retry policy (bounded, deterministic)
- Structured redacted logging/telemetry hooks
- Unit tests and integration-style tests with fakes
- Example wiring update in `examples/cycle2-compose.ts`

### Out of scope

- Full template rendering engine
- Queue workers/background jobs
- Multi-channel delivery (SMS/push)
- MFA/passkey implementation

## Goals and success criteria

- Transport-specific failures map to explicit delivery error codes (not storage-coded errors).
- Provider package can be used by core composition without changing plugin contracts.
- SMTP and API implementations share policy semantics (timeouts/retries) through one common execution layer.
- Sensitive values (tokens, secrets) are never logged in plaintext.
- Full workspace verification remains green.

## Approaches considered

### Option A (recommended): Dedicated package with transport adapters + shared policy core

Create `packages/delivery-provider` with:
- `createSmtpProvider(...)`
- `createHttpProvider(...)`
- `createResilientDeliveryProvider(...)` policy wrapper (timeouts/retries/error mapping/telemetry)

Pros:
- Clean boundary and future extensibility
- Reusable by cycle2 examples and production compositions
- Strong testability with fake transports

Cons:
- More initial package scaffolding

### Option B: Implement directly in `examples/` first, extract later

Pros:
- Faster short-term coding

Cons:
- Blurred architecture boundaries
- Higher refactor risk, repeated logic in future package extraction

### Option C: Add transport logic into core plugin layer

Pros:
- Minimal file movement

Cons:
- Violates existing separation (plugin behavior vs infra delivery)
- Couples method plugins with transport concerns

## Recommendation

Proceed with **Option A**. It aligns with existing contract-first boundaries and keeps delivery infrastructure independent from auth method behavior.

## Proposed architecture

### 1) Delivery provider package

- `src/types.ts`
  - `OutboundEmailMessage`
  - `DeliveryProvider`
  - `DeliveryTelemetry`
  - config types for SMTP/API/policy
- `src/errors.ts`
  - dedicated mapping helpers for delivery failures (e.g. `DELIVERY_UNAVAILABLE`, `DELIVERY_RATE_LIMITED`, `DELIVERY_MISCONFIGURED`)
- `src/policy/execute-with-policy.ts`
  - timeout + retry executor
- `src/smtp/smtp-provider.ts`
  - SMTP transport adapter
- `src/http/http-provider.ts`
  - HTTP API transport adapter
- `src/index.ts`
  - package exports

### 2) Integration seam

- Core remains unchanged at contract level.
- Composition creates a `DeliveryProvider` from package and passes it to:
  - `createEmailDeliveryFromProvider(...)` in core
- Existing request/consume flow in plugin remains unchanged.

### 3) Error model

- Map transport/network/timeout issues to dedicated delivery infrastructure codes.
- Preserve retryability semantics:
  - transient transport failures => `retryable: true`
  - invalid credentials/misconfiguration => `retryable: false`
- Do not swallow provider errors in core plugin path.

### 4) Observability model

- Telemetry callback with fields:
  - channel (`smtp`/`http`)
  - operation (`send`)
  - outcome (`success`/`failure`)
  - retryAttempt
  - durationMs
- Redaction rules:
  - never emit raw token values
  - never emit provider secrets
  - message content truncated/redacted in telemetry

## Data flow

1. Email-password plugin creates lifecycle token and persists hash.
2. Plugin calls `emailDelivery.send*`.
3. `createEmailDeliveryFromProvider(...)` builds message body with URL.
4. Delivery provider package sends via SMTP/API transport with retry/timeout policy.
5. Provider result returns success or mapped `AuthError`.
6. Core plugin surfaces result without broad fallback.

## Configuration design

### SMTP config

- host, port, secure, auth user/pass, from address, timeout, maxRetries

### HTTP API config

- endpoint URL, API key/header, from address, timeout, maxRetries

### Shared policy config

- request timeout
- max retry attempts
- retry backoff strategy (bounded deterministic sequence)

## Testing strategy

### Unit tests

- Error mapping for timeout, auth failure, rate limit
- Retry executor behavior (retry count and stop conditions)
- Redaction behavior in telemetry payload

### Integration-style tests (package-level)

- Fake SMTP transport:
  - success
  - timeout then success
  - permanent failure
- Fake HTTP transport:
  - 2xx success
  - 429 rate limit
  - 5xx retriable failure

### Workspace verification

- `npm run typecheck`
- `npm run build`
- `npm run test`

## Risks and mitigations

- Risk: Retry storms against provider
  - Mitigation: strict max attempts + bounded backoff
- Risk: Sensitive data leak in logs
  - Mitigation: centralized redaction utility with tests
- Risk: Divergent SMTP/API behavior
  - Mitigation: shared policy executor and unified error mapper

## Implementation boundaries

- No queueing/background processing in this slice.
- No template localization framework in this slice.
- No changes to action contracts required for this slice.

## Open decisions captured for planning

- Final package name (`delivery-provider` vs `delivery-default`)
- Chosen SMTP/HTTP client libraries already used in repo ecosystem
- Exact delivery error code naming (single code vs granular set)
