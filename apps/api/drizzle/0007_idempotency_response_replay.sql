ALTER TABLE `meal_idempotency_keys` ADD `state` text NOT NULL DEFAULT 'in_progress';
ALTER TABLE `meal_idempotency_keys` ADD `response_status` integer;
ALTER TABLE `meal_idempotency_keys` ADD `response_body` text;
ALTER TABLE `meal_idempotency_keys` ADD `updated_at` integer NOT NULL DEFAULT 0;
ALTER TABLE `meal_idempotency_keys` ADD `expires_at` integer NOT NULL DEFAULT 0;

UPDATE `meal_idempotency_keys`
SET
  `updated_at` = `created_at`,
  `expires_at` = `created_at` + 86400000,
  `state` = CASE
    WHEN `meal_id` IS NULL THEN 'in_progress'
    ELSE 'completed'
  END;

CREATE INDEX `meal_idempotency_expires_at_idx` ON `meal_idempotency_keys` (`expires_at`);
CREATE INDEX `meal_idempotency_state_updated_idx` ON `meal_idempotency_keys` (`state`, `updated_at`);
