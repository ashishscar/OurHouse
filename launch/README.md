# Public web release configuration

The app keeps ChatGPT developer sign-in (`?legacy=1`), temporary browser profiles (`?test=1`) and Supabase consumer subjects separate. Public signup is disabled until `OURHOUSE_PUBLIC_SIGNUP=enabled` and valid Supabase URL/publishable-key settings exist. Server requests verify the access token through the provider user endpoint; client-supplied subjects/emails never establish identity. The Supabase server secret is required for provider-account deletion and must never reach client bundles.

Google sign-in uses the official SDK PKCE flow, fixed root callback and local invitation retention. Persisted sessions omit Google API tokens. User IDs and deletion jobs are project-scoped; encrypted offline copies are project/user-scoped and in-flight responses are rejected after identity changes.

Runtime settings: OURHOUSE_GOOGLE_SIGNIN, OURHOUSE_EMAIL_SIGNIN, OURHOUSE_SUPABASE_URL, OURHOUSE_SUPABASE_PUBLISHABLE_KEY, OURHOUSE_SUPABASE_SECRET_KEY, OURHOUSE_PUBLIC_SIGNUP, OURHOUSE_VAPID_PUBLIC_KEY, OURHOUSE_VAPID_PRIVATE_KEY, OURHOUSE_VAPID_SUBJECT, OURHOUSE_JOB_TOKEN. The VAPID pair and job token are already configured on the current Site; public identity is not.

Worker activity drains a bounded push/deletion queue. A proper scheduler must also call POST /api/jobs/dispatch with its server-only bearer token for unattended retries. Do not replace it with browser timers. Fixed-time reminders, physical-device tests, security review, backup restoration, publisher/contact information and real email sign-in verification remain public-launch gates.

Notifications contain generic text only. Outbox insertion shares the confirmed encrypted-edit transaction; delivery rechecks active membership. Device endpoints are constrained to known browser push providers, redirects are rejected, retries are bounded and quiet hours suppress ordinary updates. Static service-worker caching excludes all APIs. The encrypted offline snapshot is refreshed after successful verified reads/writes and is bound to the consumer sign-in subject.

See the user-facing production launch and account activation guides in the task outputs for the full release checklist. No paid services or native store accounts have been enrolled.
