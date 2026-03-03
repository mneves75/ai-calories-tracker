CREATE TRIGGER `trg_meals_summary_after_insert`
AFTER INSERT ON `meals`
WHEN NEW.deleted_at IS NULL
BEGIN
  INSERT INTO daily_summaries (id, user_id, date, total_calories, total_protein, total_carbs, total_fat, meals_count, updated_at)
  VALUES (
    COALESCE((SELECT id FROM daily_summaries WHERE user_id = NEW.user_id AND date = NEW.local_date LIMIT 1), lower(hex(randomblob(16)))),
    NEW.user_id,
    NEW.local_date,
    COALESCE((SELECT SUM(calories) FROM meals WHERE user_id = NEW.user_id AND local_date = NEW.local_date AND deleted_at IS NULL), 0),
    COALESCE((SELECT SUM(protein) FROM meals WHERE user_id = NEW.user_id AND local_date = NEW.local_date AND deleted_at IS NULL), 0),
    COALESCE((SELECT SUM(carbs) FROM meals WHERE user_id = NEW.user_id AND local_date = NEW.local_date AND deleted_at IS NULL), 0),
    COALESCE((SELECT SUM(fat) FROM meals WHERE user_id = NEW.user_id AND local_date = NEW.local_date AND deleted_at IS NULL), 0),
    COALESCE((SELECT COUNT(*) FROM meals WHERE user_id = NEW.user_id AND local_date = NEW.local_date AND deleted_at IS NULL), 0),
    (CAST(strftime('%s', 'now') AS integer) * 1000)
  )
  ON CONFLICT(user_id, date) DO UPDATE SET
    total_calories = excluded.total_calories,
    total_protein = excluded.total_protein,
    total_carbs = excluded.total_carbs,
    total_fat = excluded.total_fat,
    meals_count = excluded.meals_count,
    updated_at = excluded.updated_at;
END;
--> statement-breakpoint

CREATE TRIGGER `trg_meals_summary_after_update_values`
AFTER UPDATE OF user_id, local_date, calories, protein, carbs, fat ON `meals`
WHEN OLD.deleted_at IS NULL AND NEW.deleted_at IS NULL
BEGIN
  INSERT INTO daily_summaries (id, user_id, date, total_calories, total_protein, total_carbs, total_fat, meals_count, updated_at)
  VALUES (
    COALESCE((SELECT id FROM daily_summaries WHERE user_id = OLD.user_id AND date = OLD.local_date LIMIT 1), lower(hex(randomblob(16)))),
    OLD.user_id,
    OLD.local_date,
    COALESCE((SELECT SUM(calories) FROM meals WHERE user_id = OLD.user_id AND local_date = OLD.local_date AND deleted_at IS NULL), 0),
    COALESCE((SELECT SUM(protein) FROM meals WHERE user_id = OLD.user_id AND local_date = OLD.local_date AND deleted_at IS NULL), 0),
    COALESCE((SELECT SUM(carbs) FROM meals WHERE user_id = OLD.user_id AND local_date = OLD.local_date AND deleted_at IS NULL), 0),
    COALESCE((SELECT SUM(fat) FROM meals WHERE user_id = OLD.user_id AND local_date = OLD.local_date AND deleted_at IS NULL), 0),
    COALESCE((SELECT COUNT(*) FROM meals WHERE user_id = OLD.user_id AND local_date = OLD.local_date AND deleted_at IS NULL), 0),
    (CAST(strftime('%s', 'now') AS integer) * 1000)
  )
  ON CONFLICT(user_id, date) DO UPDATE SET
    total_calories = excluded.total_calories,
    total_protein = excluded.total_protein,
    total_carbs = excluded.total_carbs,
    total_fat = excluded.total_fat,
    meals_count = excluded.meals_count,
    updated_at = excluded.updated_at;

  INSERT INTO daily_summaries (id, user_id, date, total_calories, total_protein, total_carbs, total_fat, meals_count, updated_at)
  VALUES (
    COALESCE((SELECT id FROM daily_summaries WHERE user_id = NEW.user_id AND date = NEW.local_date LIMIT 1), lower(hex(randomblob(16)))),
    NEW.user_id,
    NEW.local_date,
    COALESCE((SELECT SUM(calories) FROM meals WHERE user_id = NEW.user_id AND local_date = NEW.local_date AND deleted_at IS NULL), 0),
    COALESCE((SELECT SUM(protein) FROM meals WHERE user_id = NEW.user_id AND local_date = NEW.local_date AND deleted_at IS NULL), 0),
    COALESCE((SELECT SUM(carbs) FROM meals WHERE user_id = NEW.user_id AND local_date = NEW.local_date AND deleted_at IS NULL), 0),
    COALESCE((SELECT SUM(fat) FROM meals WHERE user_id = NEW.user_id AND local_date = NEW.local_date AND deleted_at IS NULL), 0),
    COALESCE((SELECT COUNT(*) FROM meals WHERE user_id = NEW.user_id AND local_date = NEW.local_date AND deleted_at IS NULL), 0),
    (CAST(strftime('%s', 'now') AS integer) * 1000)
  )
  ON CONFLICT(user_id, date) DO UPDATE SET
    total_calories = excluded.total_calories,
    total_protein = excluded.total_protein,
    total_carbs = excluded.total_carbs,
    total_fat = excluded.total_fat,
    meals_count = excluded.meals_count,
    updated_at = excluded.updated_at;
END;
--> statement-breakpoint

CREATE TRIGGER `trg_meals_summary_after_soft_delete`
AFTER UPDATE OF deleted_at ON `meals`
WHEN OLD.deleted_at IS NULL AND NEW.deleted_at IS NOT NULL
BEGIN
  INSERT INTO daily_summaries (id, user_id, date, total_calories, total_protein, total_carbs, total_fat, meals_count, updated_at)
  VALUES (
    COALESCE((SELECT id FROM daily_summaries WHERE user_id = OLD.user_id AND date = OLD.local_date LIMIT 1), lower(hex(randomblob(16)))),
    OLD.user_id,
    OLD.local_date,
    COALESCE((SELECT SUM(calories) FROM meals WHERE user_id = OLD.user_id AND local_date = OLD.local_date AND deleted_at IS NULL), 0),
    COALESCE((SELECT SUM(protein) FROM meals WHERE user_id = OLD.user_id AND local_date = OLD.local_date AND deleted_at IS NULL), 0),
    COALESCE((SELECT SUM(carbs) FROM meals WHERE user_id = OLD.user_id AND local_date = OLD.local_date AND deleted_at IS NULL), 0),
    COALESCE((SELECT SUM(fat) FROM meals WHERE user_id = OLD.user_id AND local_date = OLD.local_date AND deleted_at IS NULL), 0),
    COALESCE((SELECT COUNT(*) FROM meals WHERE user_id = OLD.user_id AND local_date = OLD.local_date AND deleted_at IS NULL), 0),
    (CAST(strftime('%s', 'now') AS integer) * 1000)
  )
  ON CONFLICT(user_id, date) DO UPDATE SET
    total_calories = excluded.total_calories,
    total_protein = excluded.total_protein,
    total_carbs = excluded.total_carbs,
    total_fat = excluded.total_fat,
    meals_count = excluded.meals_count,
    updated_at = excluded.updated_at;
END;
--> statement-breakpoint

CREATE TRIGGER `trg_meals_summary_after_restore`
AFTER UPDATE OF deleted_at ON `meals`
WHEN OLD.deleted_at IS NOT NULL AND NEW.deleted_at IS NULL
BEGIN
  INSERT INTO daily_summaries (id, user_id, date, total_calories, total_protein, total_carbs, total_fat, meals_count, updated_at)
  VALUES (
    COALESCE((SELECT id FROM daily_summaries WHERE user_id = NEW.user_id AND date = NEW.local_date LIMIT 1), lower(hex(randomblob(16)))),
    NEW.user_id,
    NEW.local_date,
    COALESCE((SELECT SUM(calories) FROM meals WHERE user_id = NEW.user_id AND local_date = NEW.local_date AND deleted_at IS NULL), 0),
    COALESCE((SELECT SUM(protein) FROM meals WHERE user_id = NEW.user_id AND local_date = NEW.local_date AND deleted_at IS NULL), 0),
    COALESCE((SELECT SUM(carbs) FROM meals WHERE user_id = NEW.user_id AND local_date = NEW.local_date AND deleted_at IS NULL), 0),
    COALESCE((SELECT SUM(fat) FROM meals WHERE user_id = NEW.user_id AND local_date = NEW.local_date AND deleted_at IS NULL), 0),
    COALESCE((SELECT COUNT(*) FROM meals WHERE user_id = NEW.user_id AND local_date = NEW.local_date AND deleted_at IS NULL), 0),
    (CAST(strftime('%s', 'now') AS integer) * 1000)
  )
  ON CONFLICT(user_id, date) DO UPDATE SET
    total_calories = excluded.total_calories,
    total_protein = excluded.total_protein,
    total_carbs = excluded.total_carbs,
    total_fat = excluded.total_fat,
    meals_count = excluded.meals_count,
    updated_at = excluded.updated_at;
END;
