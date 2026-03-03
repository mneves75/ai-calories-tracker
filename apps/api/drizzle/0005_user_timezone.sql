ALTER TABLE `user_profiles` ADD `user_timezone` text NOT NULL DEFAULT 'UTC';
ALTER TABLE `user_profiles` ADD `timezone_updated_at` integer NOT NULL DEFAULT 0;
UPDATE `user_profiles`
SET `timezone_updated_at` = (unixepoch() * 1000)
WHERE `timezone_updated_at` = 0;

CREATE INDEX `user_profiles_timezone_idx` ON `user_profiles` (`user_timezone`);
