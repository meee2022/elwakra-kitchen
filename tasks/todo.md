# Tasks: Card payment + leaner invoice header

- [x] 1. Server accepts `card`
  - Acceptance: cashier can push a paid `card` invoice; unpaid `card` and unknown types are rejected; `summary` returns `card`.
  - Verify: `npm test` (new test fails first, then passes)
  - Files: `tests/auth.test.ts`, `convex/invoices.ts`, `convex/schema.ts`
- [x] 2. Checkout asks for the payment method
  - Acceptance: Save opens the chooser with the total; card focused; picking a method saves (and prints); Escape returns to the cart untouched.
  - Verify: local sale with each of the three methods
  - Files: `pos/index.html`, `pos/app.js`, `pos/app.css`, `pos/i18n.js`
- [x] 3. Card shows everywhere payments are reported
  - Acceptance: badge + filter, "Card today", reports (screen and print) with card + cash + credit = total, register, Excel, dashboard.
  - Verify: figures after the three local sales
  - Files: `pos/app.js`, `pos/index.html`, `pos/dashboard.html`, `pos/i18n.js`
- [x] 4. Invoice print
  - Acceptance: title says card; only the commercial registry number remains, in the footer; QR carries no tax number.
  - Verify: headless-Chrome PDF of a card invoice, one A5 page
  - Files: `pos/app.js`
- [x] Checkpoint: `npm test`, `npm run typecheck`, Chrome 109 guard green
- [ ] 5. Ship: Convex dev → prod, bump to v23, guide + README, commit, push, check the live site
