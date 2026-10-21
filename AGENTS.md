# OurHouse development

This GitHub repository is the source for future OurHouse changes. Work on branches and use pull requests with meaningful validation. Keep the live URL and existing production bindings unless the user explicitly requests a migration.

Edit ui/ and feature source modules, then regenerate with npm run prepare:ui. Never edit only generated public assets. Run the existing release gate and isolated staging checks before publishing; do not bypass fingerprint, clean-source, actor/household isolation, idempotency or rollback checks.

No customer data or credentials belong in Git, test fixtures, logs or pull requests. Use disposable synthetic households for write tests. Production household screens require user authorization to inspect. Do not put Cloudflare or Supabase production credentials in GitHub Actions as part of ordinary fixes.

Product requirements: OurHouse branding, the existing light-blue liquid-glass design, vegetarian food only with Swaminarayan/vegetarian/vegan modes, Google account restoration without recovery-code onboarding, independent household ownership. Preserve installed-client compatibility and existing encrypted data.
