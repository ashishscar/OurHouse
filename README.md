# OurHouse

Private family app for meal planning, vegetarian recipes, shopping, pantry stock, chores and shared expenses.

Public app: https://ourhouse.ashishpatelaaa0.workers.dev/

## Current application

Release 35 adds source-grounded short receipt names and editable Pantry/Household grouping, while keeping the blue Liquid Glass design and stronger popup contrast. Labels without a supported product identity stay as printed; ambiguous sections require a choice before import. Completed AI sections survive an on-device fallback for another strip. Receipt AI remembers each user’s receipt AI choice after explicit first-use consent, processes up to four receipt sections in parallel, trims dark background conservatively, and handles retail discounts and repeated weighted produce. It retains total-weight imports, printed-total/unit reconciliation and longer receipt sections, alongside separate receipt camera and phone-gallery import, on-device long-receipt OCR, editable item review and a JSON download containing the original photo and extracted fields. Every import requires explicit product selection. A clean synthetic 72-product image passed browser extraction checks; this is not a guarantee for faded, angled or blurry real receipts.

Families use independent Google accounts through Supabase. Household roles and membership are enforced on every request. The current account flow uses service-managed encrypted recovery; it must not be described as encryption that prevents the service operator from recovering account keys. Historical device-vault/recovery-code modules remain for compatibility. See the implementation and historical protocol documents before changing keys or access control.

The public app runs directly on Cloudflare Workers. Production D1, Supabase Auth/receipt storage and existing server secrets remain attached to the running services. GitHub stores application code, migrations and tests, not customer records or runtime credentials. The retained Sites build adapter and manifest support the existing framework build; they do not change the public hosting address.

## Development

Use Node 24 and npm. Dependency versions are pinned in package-lock.json.

```sh
npm ci
npm run prepare:ui
npm test
npm run build
```

For the complete local release validation, including TypeScript, the production build, startup-size budget and Worker dry runs:

```sh
node scripts/release-gate.mjs validate
```

This command prepares the ignored deployment configuration from deployment/production.json. Its tracked contents are public resource IDs and feature flags only. A clean clone does not need a developer's absolute paths. Secrets are never generated or replaced by validation.

## Updates through GitHub

1. Create a feature/fix branch from main and implement the change.
2. Open a pull request with the concrete behavior and validation results. GitHub Actions runs the validation suite without production credentials.
3. Review the change and merge the passing commit. Keep database changes backward compatible with installed clients.
4. Deploy that exact source to private staging and run its isolated checks and the relevant browser/phone checks.
5. Upload candidate Worker versions, record the current rollback versions, then promote through the existing release gate. A failed public smoke check attempts rollback.

GitHub checks do not automatically publish to live users. The established private staging and rollback process remains required. Read [staging/README.md](staging/README.md) for the release commands. Do not run destructive migrations or rotate account keys as part of a routine release.

## Source map

- ui/: editable interface sources; public/ and lib/shell.ts include generated assets.
- launch/: sign-in, caching, background jobs, sync and release number.
- standalone/: public Cloudflare Worker entry and routing.
- lib/, crypto/: household authorization, persistence and encryption.
- receipts/, recipes/, notifications/, photos/: feature modules.
- maintenance/: bounded technical health checks and care Worker.
- drizzle/: immutable database migrations.
- staging/: isolated synthetic identity/database and release checks.
- tests/: regression, encryption, concurrency, permissions and browser-DOM checks.
- manual/: standalone interactive user guide and generator.

## Configuration and privacy

Keep .env files, .dev.vars, work directories, logs, receipts, household exports, tokens and keys out of Git. Local browser and Worker state must remain ignored. Existing Workers retain their Supabase, account-wrapping, notification and other server secrets; no production secrets are needed for GitHub validation. Do not enable automatic deployment by copying broad account credentials into a workflow.

Legacy storage names and JavaScript identifiers intentionally remain for existing users. Change visible product copy to OurHouse without renaming stored crypto paths, account scopes or database records casually.

This repository started from the verified release-31 source snapshot. Historical scratch files and generated staging dry-run artifacts are excluded. The original local engineering checkout is retained during migration.
