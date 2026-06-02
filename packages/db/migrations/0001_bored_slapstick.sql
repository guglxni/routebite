ALTER TABLE `users` ADD `session_token` text;--> statement-breakpoint
CREATE UNIQUE INDEX `users_session_token_unique` ON `users` (`session_token`);