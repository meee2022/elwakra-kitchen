# Tasks: Menu sync + invoice verification page

Spec: `SPEC-catalog-sync-and-verify.md`. (Previous list, manager cloud view, shipped.)

- [x] 1. Server: `catalog:get` (any account), `catalog:save` (manager, version check, validation)
  - Verify: `npm test` (tests fail first)
- [x] 2. Server: `invoices:verify({ uid, hash })`, public, minimal fields
  - Verify: `npm test`
- [x] 3. Client: devices follow the cloud menu; manager edits upload; first manager seeds an empty cloud
  - Verify: local run with a stubbed cloud, two devices
- [x] 4. QR becomes the verification link; `v/index.html` shows the result
  - Verify: both decoders read the link; page states render
- [x] 5. Ship: deploy backend (deploy key), bump version, docs, push, check live
