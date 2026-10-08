# Implementation Plan: Card payment + leaner invoice header

Spec: `SPEC-card-payment.md`.

## Decisions
- Third payment type `card`, settled on the spot like cash (`paid: true`). No card data stored.
- The cashier is **asked** for the payment method when saving (card is the focused button, so
  Enter picks it). The old "payment type" dropdown in the cart is removed: one explicit choice
  per sale keeps the cash/card split in the daily figures honest.
- English label for on-account stays **Credit**.
- Printed invoice shows only the commercial registry number, in the footer. The tax number and
  the establishment number leave the invoice and its QR. The ministry register keeps all three.
- Backend is deployed before the frontend (old frontend works with the new backend, not the reverse).

## Order
server rule + summary → checkout prompt → card in lists/reports/dashboard → invoice print → verify → deploy.

## Risks
| Risk | Mitigation |
|---|---|
| New frontend reaches an old backend and card sales are rejected | Deploy Convex first, then push |
| Kitchen PC runs Chrome 109 | No new CSS/JS features; `tests/compat.test.ts` must stay green |
| Stale service-worker cache | Bump `?v=` and `CACHE` to 23 |
