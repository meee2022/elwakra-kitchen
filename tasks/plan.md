# Implementation Plan: Account management in the dashboard

Spec: `SPEC-account-management.md`. (Previous plan, card payment, shipped in 55914e0.)

## Decisions
- Managers list accounts, add cashier/manager accounts, reset passwords and disable/enable accounts
  from the dashboard. Disable, never delete.
- Every change re-confirms the acting manager's own password on the server, so an unattended
  dashboard cannot mint or hijack accounts. Those confirmations share the login attempt limit.
- A manager cannot disable their own account. Since the actor is always an active manager, this
  alone guarantees at least one active manager remains.
- Resetting a password or disabling an account closes that account's sessions at once.
- Passwords are hashed with scrypt on the server (same as login). Hashes never leave the server.
- No new files on the server: actions live in `convex/auth.ts` (node runtime, scrypt), database
  functions in `convex/authSessions.ts`.

## Threat model (short)
| Threat | Mitigation |
|---|---|
| Cashier or anonymous caller invokes account functions directly | `requireSession(..., manager)` in every function; tests call the API directly |
| Unattended manager session used to create a manager | Manager password re-confirmed per change |
| Brute-forcing that confirmation with a stolen session | Shared 5-per-15-minutes attempt limit |
| Password hashes leaking through the list | Field allowlist (username, role, disabled); test asserts it |
| Manager locks everyone out | Cannot disable self |
| Disabled user keeps working on an open till | Sessions closed on the server; client must recognise the rejection (see task 2) |

## Order
server functions + tests -> client error codes -> dashboard UI -> verify -> deploy backend -> push frontend.
