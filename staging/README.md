# Isolated release checks

`ourhouse-staging` has no public hostname or routes. Its D1 database is `ourhouse-staging` (`9deb2758-9b6e-42b2-8c1e-f8940834e487`), separate from the production database. It has its own server-only `OURHOUSE_ACCOUNT_KEY`, no production secrets, no Supabase account/storage connection and no production care-service binding. Logs and traces remain disabled. Synthetic receipts are encrypted and stored in staging D1; no R2 plan is required.

The private worker accepts only four synthetic QA actor names. It strips provider/authorization headers and never authenticates real Google accounts. Every request first verifies a marker that exists only in the staging database. Accidentally binding another database fails before any account creation or write.

Initialize a new staging database only after checking its binding ID:

```
node node_modules/wrangler/bin/wrangler.js d1 migrations apply ourhouse-staging --remote --config staging/wrangler.json
node node_modules/wrangler/bin/wrangler.js d1 execute ourhouse-staging --remote --config staging/wrangler.json --file staging/database.sql --yes
```

Deploy `staging/wrangler.json` after building. On initial setup, generate an independent random 32-byte hexadecimal `OURHOUSE_ACCOUNT_KEY` and enter it through Wrangler's secret stdin. Never copy the production key or put a key in a file. Keep the staging key across normal updates.

Open a local-only proxy connected to this private worker:

```
node node_modules/wrangler/bin/wrangler.js dev --config staging/proxy.json --ip 127.0.0.1 --port 8793 --inspector-port 0
```

Browse the printed local address. `?qa=owner`, `?qa=member`, `?qa=viewer` and `?qa=foreign` choose synthetic accounts. The staging banner distinguishes these from the live app. Browser QA accounts are separate from each automated smoke run. Never enter real household content here. Stop the proxy after testing.

## Gated release

Update the single release number in `launch/release.mjs`. Maintain backward-compatible APIs and preserve account keys. Commit and push the verified source to the OurHouse GitHub repository before candidate upload.

```
node scripts/release-gate.mjs validate
node node_modules/wrangler/bin/wrangler.js deploy --config staging/wrangler.json
node scripts/release-gate.mjs stage http://127.0.0.1:8793
# Commit and push the unchanged verified source to GitHub.
node scripts/release-gate.mjs upload
node scripts/release-gate.mjs rollback-check
node scripts/release-gate.mjs promote
```

`validate` runs the regression suite, TypeScript, production build, a 90 KB HTML budget, and all three Worker dry runs. `stage` refuses a public URL, checks the private marker and exercises encrypted account setup, invitations, concurrent saves, idempotent retries, role revocation, foreign-family isolation and receipt storage. It deletes only the synthetic accounts created by its own run.

The gate records a fingerprint of the exact build, a fresh staging result, the clean source commit and the previous app/care version IDs in ignored `work/release-gate.json`. The private worker reports the validated build hash; the gate rejects a stale staging deployment before any test writes. Any build change requires revalidation and staging. `upload` creates app and care candidates without changing production traffic. `promote` checks that production has not changed, switches the coordinated versions and runs public health/asset/auth checks. A failed promotion attempts to restore both recorded versions. This is a staged, gated cutover; it does not split live users between different app versions.

For an operational rollback, run `node scripts/release-gate.mjs rollback` using the retained release record. `rollback-check` validates those commands without changing traffic. Rollback does not erase or restore household data. Do not use this procedure for destructive database migrations or account-key rotations; those need a separately reviewed compatibility and recovery plan.

Phone-width browser checks are part of release QA. They do not certify physical iPhone/Android notification delivery or native-store behavior.
