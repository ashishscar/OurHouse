CREATE TABLE `accounts` (
	`id` text PRIMARY KEY NOT NULL,
	`provider` text NOT NULL,
	`name` text NOT NULL,
	`email` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `accounts_provider_unique` ON `accounts` (`provider`);--> statement-breakpoint
CREATE TABLE `assertions` (
	`ok` integer NOT NULL,
	CONSTRAINT "transaction_revision_matches" CHECK("assertions"."ok"=1)
);
--> statement-breakpoint
CREATE TABLE `cleanup` (
	`key` text PRIMARY KEY NOT NULL
);
--> statement-breakpoint
CREATE TABLE `houses` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`owner` text NOT NULL,
	`data` text NOT NULL,
	`revision` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `invites` (
	`token` text PRIMARY KEY NOT NULL,
	`id` text NOT NULL,
	`house` text NOT NULL,
	`role` text NOT NULL,
	`expires` integer NOT NULL,
	`used` integer NOT NULL,
	`created_by` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `invites_id_unique` ON `invites` (`id`);--> statement-breakpoint
CREATE INDEX `invites_house_idx` ON `invites` (`house`);--> statement-breakpoint
CREATE TABLE `members` (
	`user` text PRIMARY KEY NOT NULL,
	`house` text NOT NULL,
	`role` text NOT NULL,
	`active` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `members_house_idx` ON `members` (`house`);--> statement-breakpoint
CREATE TABLE `operations` (
	`house` text NOT NULL,
	`actor` text NOT NULL,
	`id` text NOT NULL,
	`changes` text NOT NULL,
	`at` integer NOT NULL,
	PRIMARY KEY(`house`, `actor`, `id`)
);
--> statement-breakpoint
CREATE INDEX `operations_activity_idx` ON `operations` (`house`,`at`);--> statement-breakpoint
CREATE TABLE `rate_limits` (
	`key` text PRIMARY KEY NOT NULL,
	`window` integer NOT NULL,
	`hits` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `receipts` (
	`house` text NOT NULL,
	`grp` text NOT NULL,
	`entry` text NOT NULL,
	`id` text NOT NULL,
	`meta` text NOT NULL,
	`ready` integer NOT NULL,
	PRIMARY KEY(`house`, `grp`, `entry`, `id`)
);
