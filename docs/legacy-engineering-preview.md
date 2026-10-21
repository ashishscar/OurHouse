# Historical preview documentation

This document predates the current Google account recovery flow. See the root README for the current application.

# OurHouse — encrypted private family engineering preview

OurHouse is an independent family household app. It uses a separate Sites project, Git source repository, D1 database and private R2 bucket. No Harisumiran source, household, deployment, key or Firebase project is used.

## Current release boundary

The test entry page can be made public at the user’s explicit request; temporary test access requires a separately configured code. Managed ChatGPT sign-in is an interim engineering identity provider; the standalone consumer release needs independent OurHouse accounts and native-store work. E2EE v1 is implemented and tested, but has not received an independent cryptographic/security audit. Do not call it audited, production-certified, an App Store build or immune to malicious client updates.

Family names, recipes, household records, expense contents and receipt files are encrypted on the client. The service receives authentication/contact metadata, membership/roles, sizes, timestamps, encrypted structure and two public Admin-only schema markers. It receives no vault passphrase, recovery code, vault root or family decryption keys from the supported client. There is no developer decryption/recovery key. See [the protocol and threat model](crypto/PROTOCOL.md).

## Modules

- `crypto/e2ee.mjs`: client encryption, opaque paths, authenticated change envelopes, passphrase/recovery wrapping and invitation capabilities.
- `crypto/browser.mjs`: automatic device keys and recovery gate, encrypted API adapter, encrypted outbox/cache/receipt retry records, recovery unlock, readable export warning, private key-sharing and encrypted confirmed expense-history viewer.
- `lib/sealed-tree.mjs`: server validation of ciphertext shape, equality tokens and ancestor/field conflicts. Contains no keys or plaintext finance/kitchen validators.
- `lib/secure-store.mjs`: membership authorization, vault CAS, atomic encrypted field saves, persistent operation deduplication, encrypted audit payloads, hashed single-use invitations, key rotation, private R2 ciphertext and deletion.
- `lib/secure-http.mjs`: authenticated, same-origin encrypted API. The public `handleAPI` returns `426 E2EE_REQUIRED` for every legacy plaintext route. `CloudStore` / `handleLegacyAPI` remain test fixtures and identity/SQL utilities, not exposed save paths.
- `ui/` and `public/`: retained household UI and generated assets. `scripts/prepare-ui.mjs` regenerates the committed shell and browser crypto bundle.

## Ownership and key sharing

One account belongs to one family. Creator is Owner. Only Owner appoints Admins. Admins manage that family; Members edit; Read only members review. There is no global developer family role, house picker or cross-family recipe feed.

A random account vault root protects the family keyring; a separate high-entropy recovery code wraps the same root. New accounts automatically create their keys and remember the root and recovery code locally, wrapped with a non-extractable account-bound WebCrypto AES-GCM key in IndexedDB. Recovery export is optional in Settings. The initial compatibility password wrapper uses a random 256-bit secret, discarded after creation; users do not have to choose a passphrase. Existing vault passphrases still work and can be set optionally. The encrypted vault contains family epoch keys. Password reset at the sign-in provider cannot decrypt it. Losing device storage and every recovery code/optional passphrase loses that vault. Browser storage is not native hardware-backed storage.

Private invitations carry a separate 256-bit encryption secret in the URL fragment; only a token hash and encrypted key envelope are stored. Claim and the recipient's encrypted keyring update commit atomically. Targeted key-refresh links additionally bind the designated account. Links are single-use, revocable and valid for at most seven days.

Member removal rotates/re-encrypts current family state and disables the removed membership atomically using the exact latest revision. Every remaining member needs a fresh targeted private access link. Removal cannot erase prior copies or old keys. Historical keys allow authorized members to open retained encrypted receipts/history. Peer-assisted vault recovery and externally anchored anti-rollback protection are not implemented.

## Concurrency and semantic validation

The D1 batch compares opaque before/value tokens and parent existence, then commits encrypted data, server actor/time metadata and the operation acknowledgment atomically. Disjoint writes merge; overlapping stale edits and parent deletion races reject without partial cooking/stock updates. Confirmed operation IDs deduplicate retries. Busy responses keep the originating draft unconfirmed.

The server cannot validate encrypted financial amounts or business rules. The supported client validates them; an authorized malicious client is outside those semantic guarantees. The expense history viewer decrypts the retained server-stamped operation trail instead of treating embedded client history actor/time fields as authoritative.

## Capacity and local storage

Early bounds: 50 members, 20 active invitations, 1.5 MB encrypted state, 5 MB encrypted audit history, 10,000 operations and 100 encrypted receipt uploads per family. Service registration is capped at 50 encrypted families. Provider quotas and physical-device performance remain unverified; no paid plan or card enrollment was enabled.

Each pending operation has its own encrypted account/household storage record. The offline snapshot and vault are encrypted, while account/role/size metadata is not hidden. Receipt retry ciphertext is retained so a failed upload can finish without changing its reserved payload. Cover photos remain local. Readable exports are explicit plaintext copies and show a privacy prompt.

## Development

Use Node 24+ and the Sites plugin's supported installation/build/publication helpers. `.openai/hosting.json` is the authoritative existing project ID. Do not register a replacement Site. `npm test` runs local D1/R2 and actual browser-client DOM integration tests. `npm run prepare:ui` rebuilds the encryption client and shell. `npm run db:generate` appends schema-only migrations; keep applied migrations immutable.

This repository is self-contained. `work/`, `.wrangler/`, `.sites-runtime/`, dependency trees and synthetic identity wrappers are ignored and never published. The original loopback prototype and its tests remain in the parent chat directory, with their original data recoverable at the old location.

## Recipes

Typing in New/Edit dish searches Wikibooks Cookbook directly after 500 ms. The visible checkbox disables online requests; account cookies and referrers are omitted. No private recipe or family data is sent to a recipe server. Search is limited to recipe-category pages in the Cookbook namespace, with six suggestions and 15-second request limits. Not every dish has a match. Results are external source material, never represented as invented AI output.

Choosing a suggestion extracts plain text ingredients, servings and primary method into an editable draft, with attribution to Wikibooks contributors, an exact revision URL and CC BY-SA 4.0. Unsupported measurements remain text, not guessed conversions. Unknown serving sizes require review. HTML is parsed in a detached document, never injected into the application.

Import a pasted recipe message or up to 100 KB of JSON/text locally; supported JSON includes OurHouse recipe v1 and basic schema.org Recipe fields. Unstructured message text is retained in Notes. Save explicitly. Share uses the system sheet when available, otherwise clipboard/manual text. JSON and text downloads export only whitelisted recipe fields, never family IDs, keys, members, reviews or financial data. Source/license metadata travels with both formats. No paid recipe service or key is required.

Source: https://en.wikibooks.org/wiki/Wikibooks:Copyrights ; API: https://www.mediawiki.org/wiki/API:Search

## Product name and compatibility

The product name is **OurHouse**. All visible branding and new exports/recovery-code labels use that name. The existing hostname, local storage/IndexedDB names, crypto AAD/path markers and JavaScript globals retain internal legacy identifiers so existing encrypted accounts and pending drafts remain usable. Both legacy and OurHouse recipe-file and recovery-code prefixes are accepted. Do not change the hosting origin without first arranging device-key transfer/recovery. Independent OurHouse sign-in without ChatGPT is a confirmed user requirement, still pending platform/hosting integration.

## Remote test access

`/?test=1` opens the OurHouse test-code form without redirecting to ChatGPT. Set secret `OURHOUSE_TEST_ACCESS_HASH` to the SHA-256 digest of a random high-entropy code and set `OURHOUSE_TEST_ACCESS_EXPIRES` to an absolute Unix-millisecond deadline using native Site runtime settings. Never commit the live code. Missing/expired settings disable test sign-in.

Successful same-origin `POST /api/test-access` sets a 256-bit random `__Host-ourhouse-test` Secure/HttpOnly/SameSite=Strict cookie. D1 stores its hash, an independent account subject, code-generation hash and expiry in `test_sessions`. Cookie tokens are never in browser JavaScript or URLs. Each browser gets its own account and encrypted vault; knowing the shared access code does not open another browser’s family. Test clients select this identity mode with `x-ourhouse-test: 1`; the header alone authenticates nothing and never falls back to managed identity. Existing managed identity remains a separate route. Successful logout/deletion revokes the server-side session and clears its cookie. Account deletion cannot resurrect a test identity because authentication joins the live account row. Test invites retain `?test=1`.

Entry is limited to 5 attempts/minute per Cloudflare connection-IP bucket (one conservative shared bucket when unavailable), plus 60/minute globally. Account/storage limits remain enforced. Sessions expire with the access window and are invalidated by code-hash rotation. Browser profile loss/sign-out cannot be recovered with the shared code; the next entry creates a new disposable profile. This is temporary remote QA access, not the permanent standalone account/recovery release.
