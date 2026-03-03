CREATE TABLE `analysis_events` (
  `id` text PRIMARY KEY NOT NULL,
  `user_id` text NOT NULL,
  `local_date` text NOT NULL,
  `created_at` integer NOT NULL,
  FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `analysis_events_user_date_idx` ON `analysis_events` (`user_id`,`local_date`);
