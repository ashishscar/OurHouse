# OurHouse E2EE v1 — engineering implementation, pending independent review

## Confidentiality and trust

Family payloads are encrypted on the client with XChaCha20-Poly1305 from pinned `@noble/ciphers` 2.1.1. HMAC-SHA256 and SHA-256 use pinned `@noble/hashes` 2.0.1. Each encryption generates a fresh 192-bit nonce using the platform CSPRNG. The implementation is application code, not a claim of an audited protocol. The library's published audit does not audit OurHouse.

The operator receives authentication/contact metadata, membership/roles, timestamps, ciphertext sizes, request metadata, encrypted tree shape and two fixed schema markers for Admin-only settings. It does not receive plaintext family content, file names/types, passphrases, recovery codes, vault roots or family keys from the supported client. The web client, operating system, authorized family members and code-delivery path remain trusted. A compromised client, malicious app update, authorized member copying data, ciphertext deletion/rollback and traffic analysis are not prevented by this implementation. A new device has no external anti-rollback anchor.

## Key hierarchy and recovery

Each account generates a random 256-bit vault root and independent 256-bit recovery secret. New accounts do this automatically with no user-generated key, passphrase or mandatory recovery acknowledgment. Recovery export is available later in Settings. The server stores only authenticated root wrappers and an encrypted keyring, with no escrow or developer recovery key.

On the web, a non-extractable WebCrypto AES-256-GCM key wraps the device record containing the root and recovery code. A fresh 96-bit IV is used per record and additional authenticated data binds the account and device-record protocol. The key and ciphertext are structured-cloned into an account-indexed IndexedDB record and read back before server vault creation commits. A failed or interrupted network save retries the staged encrypted vault; Web Locks serialize initial creation across supported same-origin tabs. The root/code are not written to localStorage. Possession of browser storage and the ability to run same-origin code remains a trust boundary. Non-extractability is not a claim of OS-backed hardware isolation; XSS, malicious app delivery, an unlocked device and browser/OS compromise remain outside the confidentiality guarantee.

For compatibility with existing v1 vault records, initial creation retains the PBKDF2-HMAC-SHA256 wrapper (600,000 iterations, random 128-bit salt), using an automatically generated 256-bit random secret discarded after use. The user is not asked to choose it. Existing 16–256-character passphrases remain supported, and an optional passphrase can replace that wrapper in Settings. The high-entropy recovery code independently wraps the root and includes a typo checksum. Connecting a new device with the recovery code or existing passphrase stores an account-bound local device record, then future opens work automatically. A device without a remembered recovery code can explicitly rotate the recovery wrapper in Settings, invalidating old recovery codes while keeping the root/family keys stable.

The keyring contains family/epoch keys, encrypted under the root. Losing all device records and every saved recovery code or optional passphrase loses access to that vault. Signing in or resetting the sign-in password does not recover the keys. There is no silent encryption reset endpoint. Native Keychain/Android Keystore integration is still required for native releases. The engineering sign-in provider is interim; consumer identity is separate work.

## Context binding and encrypted records

Every envelope authenticates protocol version, purpose and its account or family/epoch/path context. A keyed comparison token is also authenticated; it is recomputed after decryption. Reusing ciphertext in another account, family, epoch, record path or purpose fails authentication.

Object names are encrypted; record identifiers are keyed HMAC path codes. The `settings` and `familyMeta` root markers are public schema hashes solely to enforce Admin-only writes. Leaf values and arrays are opaque authenticated envelopes. Object comparisons recursively compare keyed tokens, not randomized ciphertext. This leaks equality within a path/epoch; tokens cannot be dictionary-tested without a family key. Decrypted field names must match a safe identifier syntax to prevent encrypted path injection into the retained UI.

Every change includes encrypted before/value nodes, an encrypted audit path and authenticated-label ancestor guards. The server checks structure, before-token equality, parent existence, membership and role before an atomic D1 revision compare-and-swap. Disjoint field changes merge; conflicting parents/fields roll back all changes. Acknowledgments and encrypted audit payloads commit together. Confirmed operation IDs deduplicate retries. Complete state replacement is available only for an explicit key rotation with the exact latest household revision.

The server cannot semantically validate encrypted finance or kitchen values. The supported client validates them locally. The server-owned append-only encrypted operation trail supplies the confirmed actor/time for the encrypted expense history viewer. Embedded client history fields are not presented as an authoritative server audit.

## Invitation and rotation

An Admin generates a random 256-bit token and a separate random 256-bit invitation encryption secret. Only a hash of the token and an encrypted key envelope are stored. The secret lives in the URL fragment and, briefly, recipient session storage; it is never in the API payload. The decrypted envelope includes family ID, epoch, role, expiration, invitation ID, family label and the required historical family keys. These fields must match server metadata. Claim and the recipient's encrypted keyring update commit in one transaction.

Joining links are bearer capabilities: possessing the complete unused link is sufficient to join with its stored access. Targeted key-refresh links additionally require the designated authenticated account. Links expire within seven days and are single-use/revocable.

Removal generates a fresh family key and epoch, re-encrypts current state, revokes old invitations and disables the removed member atomically. Remaining members receive fresh private targeted links manually. Their old keys cannot decrypt the new epoch. No promise is made to erase previous downloads or old keys. Existing encrypted receipts/history remain readable using retained historical keys, delivered to authorized members in encrypted keyrings.

## Devices, files and recovery limitations

Outbox entries are individually encrypted under the account vault root and account/storage-key context. They remain separate records, preserving two-tab safety and recovery. The offline snapshot and keyring are encrypted; public operational metadata is not hidden. Locked vaults have no plaintext save fallback. Receipt payloads include private bytes/metadata and are encrypted before upload to opaque household/epoch/content addresses. Upload retry ciphertext is retained locally so interrupted reservations can complete without nonce/payload mismatch.

Readable family exports are explicit plaintext releases by the family user and display a privacy prompt. Recipe sharing/export displays an inline disclosure and releases only the selected recipe and its attribution, never family keys or membership. Online recipe suggestions send the typed dish query directly to Wikibooks, disclosed beside an off switch; cookies/referrers are omitted. Pasted message and file imports are parsed locally. Saved recipe content, including source/license metadata, goes through the same encrypted family transport. Optional cover photos remain local. Browser memory is not guaranteed to be securely erased by JavaScript garbage collection. Native secure-key storage, peer-assisted recovery, cryptographic identity verification UX, externally anchored anti-rollback protection, independent security review and real-device performance testing remain release work.

References: https://github.com/paulmillr/noble-ciphers ; https://developer.mozilla.org/en-US/docs/Web/API/SubtleCrypto/deriveBits
