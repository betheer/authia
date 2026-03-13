# Authia Cycle 1 Audit - Kernel + Node Adapter

## Scope

- `packages/core` kernel orchestration and startup validation
- `packages/node-adapter` request parsing and response mapping
- Regression check across workspace (`test`, `typecheck`, `build`)

## Verification evidence

- `npm run test` -> pass (`179` passed, `40` skipped integration-style DB tests)
- `npm run typecheck` -> pass
- `npm run build` -> pass

## What is now solid

- Kernel dispatch now has real action ownership resolution and plugin dispatch.
- Built-in lifecycle flows are active for `getSession`, `refreshSession`, `logout`, `logoutAll`.
- Rollback signal conversion is implemented in kernel transaction boundaries.
- Policy handling is explicit for deny/redirect/failure.
- Startup validation now rejects:
  - built-in action ownership overrides
  - missing action owners for supported actions
  - duplicate route pairs
  - session transport mismatches
  - redirect-policy/runtime capability mismatches
  - invalid cookie invariants (`sessionCookieName`, `cookieOptions.path`)
- Node adapter now performs:
  - exact `(method, path)` routing
  - duplicate sensitive-header rejection
  - credential extraction (cookie/bearer) with ambiguity checks
  - malformed `Authorization` and malformed JSON denial
  - transport mismatch denial
  - forwarded-header tuple and `publicOrigin` consistency checks
  - lowercased request header normalization
  - auth result -> response mapping with redirect capability guard

## Remaining risks / deferred

- Full end-to-end Cycle 1 integration composition is not yet implemented (`examples/` + `tests/integration/` still absent).
- Runtime startup composition path (`validateStartupConfig` + `validateNodeConfig` + migrations + freeze) still needs one reference integration harness.
- No DB-backed integration coverage yet for multi-step user/session lifecycle from HTTP ingress to storage adapter.

## Recommended next slice

1. Add `examples/cycle1-compose.ts` with frozen validated configuration.
2. Add `tests/integration/cycle1-reference-flow.test.ts` for the critical success/error matrix.
3. Wire `test:integration` and `example:cycle1` scripts in root `package.json`.
4. Re-run full verification and issue a final end-of-wave audit after integration lands.
