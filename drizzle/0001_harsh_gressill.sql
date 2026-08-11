CREATE TABLE `gemini_credentials` (
	`user_id` text PRIMARY KEY NOT NULL,
	`credentials_ciphertext` text NOT NULL,
	`credentials_iv` text NOT NULL,
	`api_key_hint` text NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `video_jobs` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`status` text NOT NULL,
	`operation_name` text NOT NULL,
	`model` text NOT NULL,
	`product_name` text NOT NULL,
	`first_prompt` text NOT NULL,
	`extension_prompt` text NOT NULL,
	`base_video_uri` text,
	`video_uri` text,
	`error_message` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`expires_at` integer
);
