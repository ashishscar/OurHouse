CREATE TABLE `secure_houses` (
	`id` text PRIMARY KEY NOT NULL,
	`owner` text NOT NULL,
	`epoch` text NOT NULL,
	`data` text NOT NULL,
	`revision` integer NOT NULL,
	`op_count` integer DEFAULT 0 NOT NULL,
	`audit_bytes` integer DEFAULT 0 NOT NULL,
	`receipt_count` integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE `secure_invites` (
	`token` text PRIMARY KEY NOT NULL,
	`id` text NOT NULL,
	`house` text NOT NULL,
	`epoch` text NOT NULL,
	`role` text NOT NULL,
	`target` text,
	`expires` integer NOT NULL,
	`used` integer NOT NULL,
	`packet` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `secure_invites_id_unique` ON `secure_invites` (`id`);--> statement-breakpoint
CREATE INDEX `secure_invites_house_idx` ON `secure_invites` (`house`);--> statement-breakpoint
CREATE TABLE `secure_members` (
	`user` text PRIMARY KEY NOT NULL,
	`house` text NOT NULL,
	`role` text NOT NULL,
	`active` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `secure_members_house_idx` ON `secure_members` (`house`);--> statement-breakpoint
CREATE TABLE `secure_operations` (
	`house` text NOT NULL,
	`actor` text NOT NULL,
	`id` text NOT NULL,
	`epoch` text NOT NULL,
	`revision` integer NOT NULL,
	`changes` text NOT NULL,
	`at` integer NOT NULL,
	PRIMARY KEY(`house`, `actor`, `id`)
);
--> statement-breakpoint
CREATE INDEX `secure_operations_revision_idx` ON `secure_operations` (`house`,`revision`);--> statement-breakpoint
CREATE TABLE `secure_receipts` (
	`house` text NOT NULL,
	`epoch` text NOT NULL,
	`id` text NOT NULL,
	`key` text NOT NULL,
	`digest` text NOT NULL,
	`actor` text NOT NULL,
	`at` integer NOT NULL,
	`ready` integer NOT NULL,
	PRIMARY KEY(`house`, `epoch`, `id`)
);
--> statement-breakpoint
CREATE TABLE `secure_vaults` (
	`user` text PRIMARY KEY NOT NULL,
	`data` text NOT NULL,
	`revision` integer NOT NULL
);
