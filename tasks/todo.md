# Tasks: Account management in the dashboard

- [x] 1. Server: list, create, reset password, disable/enable
  - Acceptance: manager-only; manager password re-confirmed; sessions closed on reset/disable; cannot disable self; no hashes in the list.
  - Verify: `npm test` (new tests fail first), `npm run typecheck`
  - Files: `tests/auth.test.ts`, `convex/auth.ts`, `convex/authSessions.ts`
- [x] 2. Client recognises server error codes in production
  - Acceptance: a revoked session locks the till instead of being treated as "offline".
  - Verify: error body from the live API maps to its code
  - Files: `pos/auth.js`
- [x] 3. Dashboard "Accounts" card
  - Acceptance: table + one form (add / reset password / disable / enable), Arabic and English, clear error messages.
  - Verify: local run against a stubbed Auth; Chrome 109 guard green
  - Files: `pos/dashboard.html`, `pos/i18n.js`
- [x] Checkpoint: tests, typecheck, compat
- [x] 4. Ship: Convex dev then prod, bump to v24, docs, commit, push, check the live site
