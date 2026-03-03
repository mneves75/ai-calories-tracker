CREATE TABLE `meal_idempotency_keys` (
  `id` text PRIMARY KEY NOT NULL,
  `user_id` text NOT NULL,
  `idempotency_key` text NOT NULL,
  `request_hash` text NOT NULL,
  `meal_id` text,
  `created_at` integer NOT NULL,
  FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
  FOREIGN KEY (`meal_id`) REFERENCES `meals`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `meal_idempotency_user_key_idx` ON `meal_idempotency_keys` (`user_id`,`idempotency_key`);
--> statement-breakpoint
CREATE INDEX `meal_idempotency_created_at_idx` ON `meal_idempotency_keys` (`created_at`);
--> statement-breakpoint
CREATE INDEX `meals_user_date_deleted_logged_idx` ON `meals` (`user_id`,`local_date`,`deleted_at`,`logged_at`);
