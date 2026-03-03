CREATE TABLE `media_objects` (
  `id` text PRIMARY KEY NOT NULL,
  `user_id` text NOT NULL,
  `image_key` text NOT NULL,
  `meal_id` text,
  `status` text NOT NULL DEFAULT 'uploaded',
  `uploaded_at` integer NOT NULL,
  `attached_at` integer,
  `delete_after` integer,
  `deleted_at` integer,
  `attempt_count` integer NOT NULL DEFAULT 0,
  `last_error` text,
  `updated_at` integer NOT NULL,
  FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
  FOREIGN KEY (`meal_id`) REFERENCES `meals`(`id`) ON UPDATE no action ON DELETE no action
);

CREATE UNIQUE INDEX `media_objects_image_key_idx` ON `media_objects` (`image_key`);
CREATE INDEX `media_objects_status_delete_after_idx` ON `media_objects` (`status`, `delete_after`);
CREATE INDEX `media_objects_user_status_idx` ON `media_objects` (`user_id`, `status`);

INSERT INTO `media_objects` (
  `id`, `user_id`, `image_key`, `meal_id`, `status`, `uploaded_at`, `attached_at`, `delete_after`, `updated_at`
)
SELECT
  lower(hex(randomblob(16))),
  m.user_id,
  m.image_key,
  m.id,
  CASE WHEN m.deleted_at IS NULL THEN 'attached' ELSE 'pending_delete' END,
  COALESCE(m.created_at, unixepoch() * 1000),
  CASE WHEN m.deleted_at IS NULL THEN COALESCE(m.created_at, unixepoch() * 1000) ELSE NULL END,
  CASE WHEN m.deleted_at IS NULL THEN NULL ELSE unixepoch() * 1000 END,
  unixepoch() * 1000
FROM `meals` m
WHERE m.image_key IS NOT NULL;
