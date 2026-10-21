CREATE TABLE `test_sessions` (
	`token` text PRIMARY KEY NOT NULL,
	`user` text NOT NULL,
	`subject` text NOT NULL,
	`code_hash` text NOT NULL,
	`expires` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `test_sessions_user_idx` ON `test_sessions` (`user`);--> statement-breakpoint
CREATE INDEX `test_sessions_expires_idx` ON `test_sessions` (`expires`);