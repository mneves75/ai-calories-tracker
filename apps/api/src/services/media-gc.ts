import type { Env } from '../types'

const MEDIA_UPLOAD_TTL_MS = 24 * 60 * 60 * 1000
const DEFAULT_GC_BATCH_SIZE = 100
const DEFAULT_MEDIA_GC_ALERT_THRESHOLD = 25

type MediaObjectRow = {
  id: string
  userId: string
  imageKey: string
  mealId: string | null
  status: 'uploaded' | 'attached' | 'pending_delete' | 'delete_failed' | 'deleted'
  deleteAfter: number | null
  attemptCount: number
}

export type MediaGcMetrics = {
  processed: number
  deleted: number
  failed: number
  orphansFound: number
  orphanDeleted: number
  pending: number
  alert: boolean
}

function nowMs(now: Date | number | undefined) {
  if (now instanceof Date) {
    return now.getTime()
  }
  if (typeof now === 'number') {
    return now
  }
  return Date.now()
}

function parseNonNegativeIntEnv(name: string, value: string | undefined, fallback: number) {
  if (value == null) {
    return fallback
  }

  const parsed = Number(value)
  if (!Number.isFinite(parsed) || parsed < 0) {
    console.error('INVALID_ENV_VALUE', { name, value, fallback })
    return fallback
  }

  return Math.floor(parsed)
}

export async function registerUploadedMedia(
  d1: D1Database,
  userId: string,
  imageKey: string,
  now?: Date | number
) {
  const uploadedAt = nowMs(now)
  const mediaId = crypto.randomUUID()
  const deleteAfter = uploadedAt + MEDIA_UPLOAD_TTL_MS

  await d1.prepare(`
    INSERT INTO media_objects (
      id,
      user_id,
      image_key,
      status,
      uploaded_at,
      delete_after,
      attempt_count,
      updated_at
    ) VALUES (?, ?, ?, 'uploaded', ?, ?, 0, ?)
  `).bind(mediaId, userId, imageKey, uploadedAt, deleteAfter, uploadedAt).run()

  return mediaId
}

export async function validateUploadedMediaOwnership(
  d1: D1Database,
  userId: string,
  analysisToken: string,
  imageKey: string
) {
  const media = await d1.prepare(`
    SELECT
      id,
      user_id AS userId,
      image_key AS imageKey,
      meal_id AS mealId,
      status,
      delete_after AS deleteAfter,
      attempt_count AS attemptCount
    FROM media_objects
    WHERE id = ? AND user_id = ? AND image_key = ? AND deleted_at IS NULL
    LIMIT 1
  `).bind(analysisToken, userId, imageKey).first<MediaObjectRow>()

  if (!media) {
    return {
      ok: false as const,
      status: 409 as const,
      body: {
        error: 'Token de mídia inválido para esta imagem',
        code: 'MEDIA_TOKEN_INVALID',
      },
    }
  }

  if (media.status === 'deleted' || media.status === 'pending_delete' || media.status === 'delete_failed') {
    return {
      ok: false as const,
      status: 409 as const,
      body: {
        error: 'Imagem indisponível para anexar à refeição',
        code: 'MEDIA_NOT_AVAILABLE',
      },
    }
  }

  return {
    ok: true as const,
    media,
  }
}

export async function attachMediaToMeal(
  d1: D1Database,
  userId: string,
  analysisToken: string,
  mealId: string,
  imageKey: string,
  now?: Date | number
) {
  const updatedAt = nowMs(now)
  const result = await d1.prepare(`
    UPDATE media_objects
    SET
      meal_id = ?,
      status = 'attached',
      attached_at = ?,
      delete_after = NULL,
      updated_at = ?,
      last_error = NULL
    WHERE id = ? AND user_id = ? AND image_key = ? AND deleted_at IS NULL
  `).bind(mealId, updatedAt, updatedAt, analysisToken, userId, imageKey).run()

  return Number(result.meta?.changes ?? 0) > 0
}

export async function markMealMediaForDeletion(
  d1: D1Database,
  userId: string,
  imageKey: string,
  mealId: string,
  now?: Date | number
) {
  const timestamp = nowMs(now)

  const result = await d1.prepare(`
    UPDATE media_objects
    SET
      status = 'pending_delete',
      delete_after = ?,
      updated_at = ?,
      last_error = NULL
    WHERE user_id = ? AND image_key = ? AND deleted_at IS NULL
  `).bind(timestamp, timestamp, userId, imageKey).run()

  if (Number(result.meta?.changes ?? 0) > 0) {
    return
  }

  await d1.prepare(`
    INSERT INTO media_objects (
      id,
      user_id,
      image_key,
      meal_id,
      status,
      uploaded_at,
      attached_at,
      delete_after,
      attempt_count,
      updated_at
    ) VALUES (?, ?, ?, ?, 'pending_delete', ?, ?, ?, 0, ?)
  `).bind(
    crypto.randomUUID(),
    userId,
    imageKey,
    mealId,
    timestamp,
    timestamp,
    timestamp,
    timestamp
  ).run()
}

async function hasActiveMealReference(d1: D1Database, userId: string, imageKey: string) {
  const row = await d1.prepare(`
    SELECT id
    FROM meals
    WHERE user_id = ? AND image_key = ? AND deleted_at IS NULL
    ORDER BY created_at DESC
    LIMIT 1
  `).bind(userId, imageKey).first<{ id: string }>()

  return row?.id ?? null
}

export async function getMediaGcStatus(d1: D1Database, now?: Date | number) {
  const timestamp = nowMs(now)

  const pendingRow = await d1.prepare(`
    SELECT COUNT(*) AS count
    FROM media_objects
    WHERE deleted_at IS NULL AND (
      status = 'pending_delete'
      OR status = 'delete_failed'
      OR (status = 'uploaded' AND delete_after IS NOT NULL AND delete_after <= ?)
    )
  `).bind(timestamp).first<{ count: number }>()

  const failedRow = await d1.prepare(`
    SELECT COUNT(*) AS count
    FROM media_objects
    WHERE deleted_at IS NULL AND status = 'delete_failed'
  `).first<{ count: number }>()

  return {
    pending: Number(pendingRow?.count ?? 0),
    failed: Number(failedRow?.count ?? 0),
  }
}

export async function runMediaGcCycle(
  env: Env,
  options: { now?: Date | number; batchSize?: number } = {}
): Promise<MediaGcMetrics> {
  const timestamp = nowMs(options.now)
  const batchSize = Math.max(1, Math.min(options.batchSize ?? DEFAULT_GC_BATCH_SIZE, 500))

  const candidates = await env.DB.prepare(`
    SELECT
      id,
      user_id AS userId,
      image_key AS imageKey,
      meal_id AS mealId,
      status,
      delete_after AS deleteAfter,
      attempt_count AS attemptCount
    FROM media_objects
    WHERE deleted_at IS NULL AND (
      status = 'pending_delete'
      OR status = 'delete_failed'
      OR (status = 'uploaded' AND delete_after IS NOT NULL AND delete_after <= ?)
    )
    ORDER BY updated_at ASC
    LIMIT ?
  `).bind(timestamp, batchSize).all<MediaObjectRow>()

  const metrics: MediaGcMetrics = {
    processed: 0,
    deleted: 0,
    failed: 0,
    orphansFound: 0,
    orphanDeleted: 0,
    pending: 0,
    alert: false,
  }

  for (const candidate of candidates.results) {
    metrics.processed += 1

    const activeMealId = await hasActiveMealReference(env.DB, candidate.userId, candidate.imageKey)
    if (activeMealId) {
      await env.DB.prepare(`
        UPDATE media_objects
        SET
          meal_id = ?,
          status = 'attached',
          delete_after = NULL,
          updated_at = ?,
          last_error = NULL
        WHERE id = ?
      `).bind(activeMealId, timestamp, candidate.id).run()
      continue
    }

    const isOrphan = candidate.status === 'uploaded'
    if (isOrphan) {
      metrics.orphansFound += 1
    }

    if (!env.R2) {
      metrics.failed += 1
      await env.DB.prepare(`
        UPDATE media_objects
        SET
          status = 'delete_failed',
          attempt_count = attempt_count + 1,
          last_error = ?,
          updated_at = ?
        WHERE id = ?
      `).bind('R2 binding ausente', timestamp, candidate.id).run()
      continue
    }

    try {
      await env.R2.delete(candidate.imageKey)
      await env.DB.prepare(`
        UPDATE media_objects
        SET
          status = 'deleted',
          deleted_at = ?,
          delete_after = NULL,
          updated_at = ?,
          last_error = NULL
        WHERE id = ?
      `).bind(timestamp, timestamp, candidate.id).run()
      metrics.deleted += 1
      if (isOrphan) {
        metrics.orphanDeleted += 1
      }
    } catch (error) {
      metrics.failed += 1
      const message = error instanceof Error ? error.message.slice(0, 400) : 'Falha desconhecida ao deletar mídia'
      await env.DB.prepare(`
        UPDATE media_objects
        SET
          status = 'delete_failed',
          attempt_count = attempt_count + 1,
          last_error = ?,
          updated_at = ?
        WHERE id = ?
      `).bind(message, timestamp, candidate.id).run()
    }
  }

  const status = await getMediaGcStatus(env.DB, timestamp)
  metrics.pending = status.pending

  const alertThreshold = parseNonNegativeIntEnv(
    'MEDIA_GC_ALERT_THRESHOLD',
    env.MEDIA_GC_ALERT_THRESHOLD,
    DEFAULT_MEDIA_GC_ALERT_THRESHOLD
  )

  if (metrics.failed > 0 || status.pending >= alertThreshold) {
    metrics.alert = true
    console.error('MEDIA_GC_ALERT', {
      failedInCycle: metrics.failed,
      pending: status.pending,
      alertThreshold,
      processed: metrics.processed,
      deleted: metrics.deleted,
      orphanDeleted: metrics.orphanDeleted,
    })
  }

  return metrics
}
