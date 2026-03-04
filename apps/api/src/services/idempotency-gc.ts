export async function purgeExpiredMealIdempotencyKeys(db: D1Database, now = Date.now()) {
  const result = await db.prepare(`
    DELETE FROM meal_idempotency_keys
    WHERE expires_at > 0 AND expires_at <= ?
  `).bind(now).run()

  return Number(result.meta?.changes ?? 0)
}
