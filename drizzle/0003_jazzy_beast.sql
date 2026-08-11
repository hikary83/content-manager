CREATE TABLE `project_assets` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`user_id` text NOT NULL,
	`kind` text NOT NULL,
	`file_name` text NOT NULL,
	`content_type` text NOT NULL,
	`object_key` text NOT NULL,
	`size` integer NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `project_assets_object_key_unique` ON `project_assets` (`object_key`);--> statement-breakpoint
CREATE INDEX `idx_project_assets_project` ON `project_assets` (`project_id`);--> statement-breakpoint
CREATE INDEX `idx_project_assets_user_created` ON `project_assets` (`user_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `shorts_projects` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`title` text NOT NULL,
	`product_name` text NOT NULL,
	`status` text DEFAULT 'draft' NOT NULL,
	`data_json` text NOT NULL,
	`coupang_url` text,
	`infoq_url` text,
	`publish_url` text,
	`published_at` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_shorts_projects_user_updated` ON `shorts_projects` (`user_id`,`updated_at`);