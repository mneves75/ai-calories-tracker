CREATE TABLE `auth_rate_limits` (
  `id` text PRIMARY KEY NOT NULL,
  `key` text NOT NULL,
  `window_start` integer NOT NULL,
  `attempts` integer NOT NULL DEFAULT 0,
  `created_at` integer NOT NULL,
  `updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `auth_rate_limits_key_window_idx` ON `auth_rate_limits` (`key`,`window_start`);
--> statement-breakpoint
CREATE INDEX `auth_rate_limits_window_idx` ON `auth_rate_limits` (`window_start`);
