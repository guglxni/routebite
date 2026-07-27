ALTER TABLE `users` ADD COLUMN `username` text;
--> statement-breakpoint
ALTER TABLE `users` ADD COLUMN `email` text;
--> statement-breakpoint
ALTER TABLE `users` ADD COLUMN `name` text;
--> statement-breakpoint
ALTER TABLE `users` ADD COLUMN `role` text DEFAULT 'user' NOT NULL;
