# Delivery Transport Cleanup Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.
>
> I'm using the writing-plans skill to create the implementation plan.

**Goal:** Extend delivery transports with an optional cleanup hook and ensure the SMTP provider exposes it while keeping HTTP behavior unchanged.

**Architecture:** Add an optional `close` method to the core `DeliveryTransport` type, implement `close` in the SMTP provider by delegating to Nodemailer when available, and keep the HTTP transport unchanged but type-compatible. Tests ensure SMTP close delegation works and error propagation is covered.

**Tech Stack:** TypeScript, Nodemailer, Vitest, npm scripts (`npm run test`, `npm run typecheck`).

---

## File Structure
- `packages/delivery-provider/src/types.ts` — extend `DeliveryTransport` definition.
- `packages/delivery-provider/src/smtp/smtp-provider.ts` — add optional `close` implementation delegating to Nodemailer.
- `packages/delivery-provider/src/smtp/smtp-provider.test.ts` — add tests confirming delegation, no-op behavior, and error propagation.
- `packages/delivery-provider/src/http/http-provider.ts` — verify typings remain compatible (no code change expected).

---

## Chunk 1: Delivery Transport Cleanup Plan

### Task 1: Extend DeliveryTransport Contract

**Files:**
- Modify: `packages/delivery-provider/src/types.ts`

- [ ] **Step 1: Capture baseline types**

Run: `npm run typecheck -w @authia/delivery-provider`
Expected: PASS

- [ ] **Step 2: Update DeliveryTransport definition**

Add `close?: () => Promise<void> | void;` with docstring explaining lifecycle semantics and error propagation expectations.

- [ ] **Step 3: Re-run typecheck to ensure optional field accepted**

Run: `npm run typecheck -w @authia/delivery-provider`
Expected: PASS

- [ ] **Step 4: Commit type contract change**

```bash
git add packages/delivery-provider/src/types.ts
git commit -m "feat(delivery): add optional transport close contract"
```

### Task 2: Add SMTP close delegation tests

**Files:**
- Modify: `packages/delivery-provider/src/smtp/smtp-provider.test.ts`

- [ ] **Step 1: Write test ensuring provider exposes close that calls transport.close**

Add test `it('delegates close to transport when available', ...)` that stubs `close` and asserts invocation.

- [ ] **Step 2: Write test ensuring provider close propagates errors**

Mock `close` to reject, call `provider.close?.()` and assert rejection matches.

- [ ] **Step 3: Add test verifying close resolves when transport lacks close**

Mock a transport without `close`, assert that `provider.close` is defined and calling it resolves without throwing, proving the provider supplies a no-op wrapper when necessary.

- [ ] **Step 4: Add test verifying repeated close calls remain safe when no underlying close exists**

Mock a transport without `close`, call `provider.close?.()` twice, and assert both resolutions succeed. This encodes the spec’s requirement that the provider’s wrapper is harmless even if consumers invoke it multiple times.

- [ ] **Step 5: Run targeted tests and observe failures**

Run: `npm run test -- packages/delivery-provider/src/smtp/smtp-provider.test.ts`
Expected: FAIL with errors like “provider.close is not a function” / “transport.close rejection not propagated” / “close duplicate call threw” confirming tests guard new behavior.

- [ ] **Step 6: Leave tests staged but uncommitted until implementation passes**

This maintains TDD flow—do not commit failing tests yet.

### Task 3: Implement SMTP close lifecycle

**Files:**
- Modify: `packages/delivery-provider/src/smtp/smtp-provider.ts`

- [ ] **Step 1: Update NodemailerTransport type**

Add optional `close?: () => Promise<void> | void;`.

- [ ] **Step 2: Implement provider close method**

Return transport object with `close: async () => { if (typeof transport.close === 'function') await transport.close(); }`.

- [ ] **Step 3: Ensure returned type matches DeliveryTransport**

If necessary, assert return type via explicit annotation to catch regressions.

- [ ] **Step 4: Run SMTP tests**

Run: `npm run test -- packages/delivery-provider/src/smtp/smtp-provider.test.ts`
Expected: PASS

- [ ] **Step 5: Commit SMTP implementation + tests**

```bash
git add packages/delivery-provider/src/smtp/smtp-provider.ts packages/delivery-provider/src/smtp/smtp-provider.test.ts
git commit -m "feat(smtp): expose transport close hook"
```

### Task 4: Verify HTTP provider compatibility

**Files:**
- Inspect: `packages/delivery-provider/src/http/http-provider.ts`

- [ ] **Step 1: Confirm no code changes required**

Ensure provider already satisfies updated type (no `close` expected).

- [ ] **Step 2: Run HTTP tests to confirm behavior unchanged**

Run: `npm run test -- packages/delivery-provider/src/http/http-provider.test.ts`
Expected: PASS

### Task 5: Final verification

- [ ] **Step 1: Run package typecheck**

Run: `npm run typecheck -w @authia/delivery-provider`
Expected: PASS

- [ ] **Step 2: Run both targeted test suites (SMTP + HTTP)**

```
npm run test -- packages/delivery-provider/src/smtp/smtp-provider.test.ts
npm run test -- packages/delivery-provider/src/http/http-provider.test.ts
```

Expected: PASS

- [ ] **Step 3: Run broader delivery-provider suite (optional but recommended)**

Run: `npm run test -- packages/delivery-provider`
Expected: PASS

- [ ] **Step 4: Perform final commit bundling remaining files (if tasks not individually committed)**

```bash
git add packages/delivery-provider/src/types.ts packages/delivery-provider/src/smtp/smtp-provider.ts packages/delivery-provider/src/smtp/smtp-provider.test.ts
git commit -m "fix(delivery): add transport cleanup lifecycle"
```

- [ ] **Step 5: Document summary in commit message referencing resource leak fix**

Ensure final commit explains optional `close` contract and SMTP cleanup.

- [ ] **Step 6: Push or report status per workflow**

Run: `git status --short`
