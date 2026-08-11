CREATE TABLE `coupang_credentials` (
	`user_id` text PRIMARY KEY NOT NULL,
	`credentials_ciphertext` text NOT NULL,
	`credentials_iv` text NOT NULL,
	`access_key_hint` text NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `coupang_product_cache` (
	`user_id` text NOT NULL,
	`cache_key` text NOT NULL,
	`payload` text NOT NULL,
	`expires_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	PRIMARY KEY(`user_id`, `cache_key`)
);
