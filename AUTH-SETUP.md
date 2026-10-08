# Account authentication rollout

Status: implemented and locally tested, not deployed. Convex CLI currently reports that the signed-in account cannot access the configured project. Do not push this frontend to Pages before the backend and accounts are ready.

## Activation

1. Authenticate the Convex CLI with the owner of the existing project. Keep the existing production deployment `descriptive-poodle-579` and development deployment `necessary-ox-824`; do not create a replacement project or move invoices.
2. Regenerate Convex types with `npx convex codegen`, then run `npm run typecheck` and `npm test`.
3. Deploy the backend using `npx convex deploy`. Deploying disables the legacy shared-key API. Schedule this during a quiet period; existing clients need the updated frontend and a login before synchronization resumes.
4. Create the two accounts from a trusted local terminal (passwords are prompted without echoing and only scrypt hashes are sent):
   - `python scripts/create-account.py admin manager --prod`
   - `python scripts/create-account.py cashier cashier --prod`
   The script refuses to overwrite an existing account. Passwords need 8+ characters (online guessing is capped at 5 attempts per 15 minutes per account). Choose unique passwords and keep them in a password manager. There are no default credentials.
5. Verify manager and cashier on the local UI connected to production; use test data on a separate development deployment when testing invoice writes. Publish the validated frontend to the existing GitHub Pages destination, then refresh cashier devices.

## Permissions

- Manager: reporting, invoice reads, synchronization and administration.
- Cashier: POS screen and creation of new valid invoices. Exact upload retries are allowed; changes to an existing invoice are rejected. Only invoices created by the currently signed-in cashier are queued for that account; managers can upload legacy pending invoices.
- Server API rejects unauthenticated requests and shared SYNC_KEY credentials, including direct requests to reports and wipe functions.
- Sessions use random 256-bit tokens, stored as hashes on the server, with an 8-hour absolute expiry. Passwords are scrypt hashes with per-account salts. Public sign-up and role selection are not available.
- Tokens live in sessionStorage rather than localStorage. Logout revokes the current session on the server when online and locks other open tabs in the same origin. When offline, local logout occurs immediately and remote revocation cannot complete; the token expires at its normal deadline.
- Login requires the network. Reloading validates the session with the server when it is reachable; if the server cannot be reached, the app resumes on the stored unexpired session so an outage does not stop the till (a session the server rejects is always dropped). An already-open cashier screen continues to work offline until expiry. An unsaved cart is retained in sessionStorage on lock and restored only after the same account signs in again.
- Global and per-account login-attempt limits mitigate guessing. Repeated failed attempts temporarily lock the username; there is no public account reset workflow.

- An upload whose number is already held by a different invoice (different fingerprint) is rejected with UID_CONFLICT rather than overwriting it; cancelling or collecting the same invoice still updates it.

## Scope and limitations

This protects server data and ordinary access through the link. Legacy invoices are still in IndexedDB on the cashier device, not encrypted by this change. Anyone controlling that device or its browser developer tools can read locally stored data. Use a dedicated OS account/device for the cashier; do not describe this as encryption of local invoice history. Browser session tokens are exposed to same-origin JavaScript, so XSS defenses remain necessary.

The local lock.js PIN remains an additional device lock. It cannot substitute for server authentication. Physical printing, a live login and live synchronization still require verification after backend access is restored.
