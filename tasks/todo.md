# Tasks: Manager sees every invoice from any device

Spec: `SPEC-manager-cloud-view.md`. (Previous list, account management, shipped.)

- [x] 1. Server: `invoices:changes({ since, limit })`, manager only, incremental
  - Acceptance: cashier/anonymous refused; only rows newer than `since`; a page never splits invoices that arrived together.
  - Verify: `npm test` (new test fails first), `npm run typecheck`
  - Files: `tests/auth.test.ts`, `convex/invoices.ts`, `convex/schema.ts`
- [x] 2. Client: managers mirror the cloud automatically
  - Acceptance: empty device + manager shows everything; remote void/collect follows; pending local edits win; nothing local is ever deleted; next number moves past the highest.
  - Verify: local run against a stubbed cloud; Chrome 109 guard green
  - Files: `pos/sync.js`, `pos/app.js`
- [x] Checkpoint: tests, typecheck, compat
- [x] 3. Ship: Convex dev then prod, bump version, docs, commit, push, check the live site
