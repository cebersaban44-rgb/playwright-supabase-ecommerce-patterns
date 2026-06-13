# Playwright + Supabase E-commerce Test Patterns

Reusable end-to-end testing patterns for a Next.js + Supabase e-commerce stack, extracted and
generalized from a real production platform. These are the patterns I reach for when I need to
protect checkout, payments, access control and realtime features without ever touching production
data.

This repository contains **patterns, not a runnable app**. Each example is a focused, framework-level
recipe you adapt to your own project. No client names, no business logic, no secrets.

## The core idea: test against a disposable local stack

Every test runs against a local Supabase stack (via the Supabase CLI), seeded fresh, on `127.0.0.1`.
Production is never contacted. The same suite runs locally and in CI. This is what makes it safe to
test payment callbacks, bans, and stock mutations aggressively: the blast radius is a throwaway
container.

## Patterns

### 1. Role-based storage state (`examples/role-storage-state/`)
Log in once per role in a Playwright `setup` project, save the authenticated session to a storage
state file, and reuse it across the suite. One state per role (customer, dealer, admin). Includes
the subtle bits: why you wait for an exact pathname instead of a regex, and why login setup is
serial.

### 2. PSP webhook HMAC + idempotency (`examples/psp-webhook-hmac/`)
How to test the code that moves money without moving money. The payment service provider confirms a
charge by calling your server back with an HMAC-signed message. In the test you compute that exact
signature with test credentials and post the callback yourself. Covers the cases that matter:
success decrements stock once, a duplicate retry is a no-op, a tampered signature is rejected with
no side effects.

### 3. Realtime notification test (`examples/realtime-toast-test/`)
Verifying a websocket feature with two independent browser/API contexts: one subscribes (the admin),
another triggers the event (a customer order), and the first asserts the live notification appears
without a refresh. Includes the trap that wastes hours: subscribe only after the session is loaded
and `realtime.setAuth` is called, or the channel joins anonymously and silently receives nothing.

### 4. LLM-assisted scenario schema (`examples/scenario-schema/`)
A JSON schema for having an LLM draft test scenarios from product docs, with a status field that
forces human review. The point of the schema is the rejection path: every scenario must be verified
against real code before it becomes a test.

### 5. CI workflow (`examples/ci-workflow/e2e-ci.yml`)
A non-blocking GitHub Actions workflow that boots the local Supabase stack, seeds it, builds the app,
and runs the suite on every push. Includes a retry around stack startup (Docker Hub rate limits are
intermittent) and the Node version pin that matters. It lives under `examples/` on purpose: this is a
reference file to copy into your own project's `.github/workflows/`, not a workflow for this
patterns-only repo (there is no app here to run).

## Why these exist

I run a production e-commerce platform end to end, including its database, infrastructure and
deployment. When I added an automated safety net, these are the patterns that proved their worth,
including one that surfaced a real authentication bug that only failed in CI, never on my machine.

## License

MIT. Use freely, adapt to your stack.
