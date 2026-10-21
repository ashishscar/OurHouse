CREATE TABLE IF NOT EXISTS `managed_account_keys` (
 `user` text PRIMARY KEY NOT NULL,
 `data` text NOT NULL,
 `legacy_vault` text,
 `created_at` integer NOT NULL
);
