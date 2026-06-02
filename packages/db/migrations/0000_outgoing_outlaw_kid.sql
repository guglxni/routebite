CREATE TABLE `intercepts` (
	`id` text PRIMARY KEY NOT NULL,
	`journey_id` text NOT NULL,
	`lat` real NOT NULL,
	`lng` real NOT NULL,
	`type` text NOT NULL,
	`score` integer NOT NULL,
	`estimated_dwell_time` integer,
	`restaurant_count` integer,
	`safety_rating` real,
	`name` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`journey_id`) REFERENCES `journeys`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `journeys` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` integer,
	`origin_address` text NOT NULL,
	`origin_lat` real NOT NULL,
	`origin_lng` real NOT NULL,
	`dest_address` text NOT NULL,
	`dest_lat` real NOT NULL,
	`dest_lng` real NOT NULL,
	`transport_mode` text NOT NULL,
	`vehicle_details_json` text,
	`route_polyline` text NOT NULL,
	`estimated_duration` integer,
	`status` text DEFAULT 'active' NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `orders` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` integer,
	`journey_id` text,
	`intercept_id` text,
	`swiggy_order_id` text,
	`server` text NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`total_amount` integer NOT NULL,
	`timing_type` text NOT NULL,
	`placed_at` integer,
	`notes` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`journey_id`) REFERENCES `journeys`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`intercept_id`) REFERENCES `intercepts`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE TABLE `tracking_events` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`order_id` text NOT NULL,
	`customer_lat` real,
	`customer_lng` real,
	`rider_lat` real,
	`rider_lng` real,
	`customer_eta` integer,
	`rider_eta` integer,
	`alignment_score` real,
	`recorded_at` integer NOT NULL,
	FOREIGN KEY (`order_id`) REFERENCES `orders`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `users` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`swiggy_id_hash` text NOT NULL,
	`access_token_encrypted` text NOT NULL,
	`refresh_token` text,
	`token_expiry` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `users_swiggy_id_hash_unique` ON `users` (`swiggy_id_hash`);