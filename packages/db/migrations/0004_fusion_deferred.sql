-- Fusion: deferred place + corridor metadata on orders
ALTER TABLE `orders` ADD COLUMN `auto_place_at` integer;
ALTER TABLE `orders` ADD COLUMN `deferred_payload_json` text;
ALTER TABLE `orders` ADD COLUMN `place_attempts` integer DEFAULT 0;
ALTER TABLE `orders` ADD COLUMN `last_place_error` text;
ALTER TABLE `orders` ADD COLUMN `swiggy_address_id` text;
ALTER TABLE `orders` ADD COLUMN `meal_query_hint` text;
ALTER TABLE `orders` ADD COLUMN `halt_gate_json` text;
