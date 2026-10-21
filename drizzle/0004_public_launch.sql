CREATE TABLE `auth_cleanup` (
	`id` text PRIMARY KEY NOT NULL,
	`subject` text,
	`created_at` integer NOT NULL,
	`attempts` integer NOT NULL,
	`next_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `push_deliveries` (
	`id` text PRIMARY KEY NOT NULL,
	`subscription` text NOT NULL,
	`house` text NOT NULL,
	`kind` text NOT NULL,
	`created_at` integer NOT NULL,
	`next_at` integer NOT NULL,
	`attempts` integer NOT NULL,
	`lease_until` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `push_deliveries_due_idx` ON `push_deliveries` (`next_at`,`lease_until`);--> statement-breakpoint
CREATE TABLE `push_subscriptions` (
	`id` text PRIMARY KEY NOT NULL,
	`user` text NOT NULL,
	`endpoint` text NOT NULL,
	`p256dh` text NOT NULL,
	`auth` text NOT NULL,
	`prefs` text NOT NULL,
	`mode` text NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `push_subscriptions_user_idx` ON `push_subscriptions` (`user`);