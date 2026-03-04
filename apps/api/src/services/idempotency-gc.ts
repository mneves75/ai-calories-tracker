export type IdempotencyHealthStatus = {
  inProgress: number
  staleInProgress: number
  completedNotExpired: number
  expired: number
}

const DEFAULT_STALE_IN_PROGRESS_MS = 2 * 60 * 1000

function toCount(value: unknown) {
  const parsed = Number(value)
  if (!Number.isFinite(parsed) || parsed < 0) {
    return 0
  }
  return Math.floor(parsed)
}

function toStaleCutoff(now: number, staleInProgressMs: number) {
  const windowMs = Number.isFinite(staleInProgressMs) && staleInProgressMs > 0
    ? Math.floor(staleInProgressMs)
    : DEFAULT_STALE_IN_PROGRESS_MS
  return now - windowMs
}

export async function purgeExpiredMealIdempotencyKeys(db: D1Database, now = Date.now()) {
  const result = await db.prepare(`
    DELETE FROM meal_idempotency_keys
    WHERE expires_at > 0 AND expires_at <= ?
  `).bind(now).run()

  return toCount(result.meta?.changes)
}

export async function getIdempotencyHealthStatus(
  db: D1Database,
  now = Date.now(),
  staleInProgressMs = DEFAULT_STALE_IN_PROGRESS_MS
): Promise<IdempotencyHealthStatus> {
  const staleCutoff = toStaleCutoff(now, staleInProgressMs)

  const row = await db.prepare(`
    SELECT
      COALESCE(SUM(CASE WHEN state = 'in_progress' AND (expires_at = 0 OR expires_at > ?) THEN 1 ELSE 0 END), 0) AS inProgress,
      COALESCE(SUM(CASE WHEN state = 'in_progress' AND (expires_at = 0 OR expires_at > ?) AND updated_at <= ? THEN 1 ELSE 0 END), 0) AS staleInProgress,
      COALESCE(SUM(CASE WHEN state = 'completed' AND (expires_at = 0 OR expires_at > ?) THEN 1 ELSE 0 END), 0) AS completedNotExpired,
      COALESCE(SUM(CASE WHEN expires_at > 0 AND expires_at <= ? THEN 1 ELSE 0 END), 0) AS expired
    FROM meal_idempotency_keys
  `).bind(
    now,
    now,
    staleCutoff,
    now,
    now
  ).first<{
    inProgress: number | null
    staleInProgress: number | null
    completedNotExpired: number | null
    expired: number | null
  }>()

  return {
    inProgress: toCount(row?.inProgress),
    staleInProgress: toCount(row?.staleInProgress),
    completedNotExpired: toCount(row?.completedNotExpired),
    expired: toCount(row?.expired),
  }
}
