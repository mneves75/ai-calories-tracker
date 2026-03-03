import { Hono, type Context } from 'hono'
import { createMiddleware } from 'hono/factory'
import { z } from 'zod'
import { eq, and, isNull, desc } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/d1'
import { authMiddleware } from '../middleware/auth'
import { jsonValidator, queryValidator, paramValidator } from '../middleware/validate'
import { analyzeFood } from '../services/gemini'
import { getDateForTimezone } from '../lib/timezone'
import {
  attachMediaToMeal,
  markMealMediaForDeletion,
  registerUploadedMedia,
  validateUploadedMediaOwnership,
} from '../services/media-gc'
import * as schema from '../db/schema'
import type { Env } from '../types'

type MealEnv = {
  Bindings: Env
  Variables: {
    user: { id: string; email: string; name: string }
  }
}

const mealRoutes = new Hono<MealEnv>()

const MAX_ANALYZE_IMAGE_BYTES = 2 * 1024 * 1024
const ANALYZE_TIMEOUT_MS = 15_000
const ANALYZE_TIMEOUT_ERROR = 'AI_ANALYSIS_TIMEOUT'
const IDEMPOTENCY_KEY_HEADER = 'idempotency-key'
const IDEMPOTENCY_KEY_PATTERN = /^[A-Za-z0-9._:-]{8,128}$/

type AnalyzeImagePayload = {
  normalizedBase64: string
  binaryImage: Uint8Array
}

type AnalyzeMappedError = {
  status: 422 | 429 | 503
  error: string
}

type MealSelectRow = {
  id: string
  userId: string
  imageKey: string | null
  mealType: 'breakfast' | 'lunch' | 'dinner' | 'snack'
  name: string
  calories: number
  protein: number
  carbs: number
  fat: number
  foodsDetected: string | null
  aiConfidence: 'high' | 'medium' | 'low' | null
  isManualEntry: number
  localDate: string
  loggedAt: string
  createdAt: number
  deletedAt: number | null
}

type MealIdempotencyRow = {
  requestHash: string
  mealId: string | null
}

type ManualPayload = {
  name: string
  mealType: 'breakfast' | 'lunch' | 'dinner' | 'snack'
  calories: number
  protein: number
  carbs: number
  fat: number
  localDate: string
  imageKey?: string
  foodsDetected?: Array<{
    name: string
    portion: string
    calories: number
    protein: number
    carbs: number
    fat: number
  }>
  aiConfidence?: 'high' | 'medium' | 'low'
  isManualEntry?: boolean
  analysisToken?: string
}

class AnalyzeValidationError extends Error {
  constructor(
    public readonly status: 400 | 413,
    message: string
  ) {
    super(message)
  }
}

const analyzeContentLengthGuard = createMiddleware<MealEnv>(async (c, next) => {
  const contentLengthHeader = c.req.header('content-length')
  if (contentLengthHeader) {
    const contentLength = Number(contentLengthHeader)
    if (Number.isFinite(contentLength) && contentLength > MAX_ANALYZE_IMAGE_BYTES * 2) {
      return c.json({ error: 'Imagem excede o limite de 2MB' }, 413)
    }
  }

  await next()
})

function parseAnalyzeImageBase64(imageBase64: string): AnalyzeImagePayload {
  const trimmedInput = imageBase64.trim()
  const dataUrlMatch = trimmedInput.match(/^data:image\/[a-zA-Z0-9.+-]+;base64,(.+)$/)
  const normalizedBase64 = (dataUrlMatch?.[1] ?? trimmedInput).replace(/\s+/g, '')

  if (normalizedBase64.length === 0) {
    throw new AnalyzeValidationError(400, 'Imagem em base64 inválida')
  }

  if (normalizedBase64.length % 4 !== 0 || !/^[A-Za-z0-9+/]+={0,2}$/.test(normalizedBase64)) {
    throw new AnalyzeValidationError(400, 'Imagem em base64 inválida')
  }

  const padding = normalizedBase64.endsWith('==')
    ? 2
    : normalizedBase64.endsWith('=')
      ? 1
      : 0

  const estimatedBytes = Math.floor((normalizedBase64.length * 3) / 4) - padding
  if (estimatedBytes <= 0) {
    throw new AnalyzeValidationError(400, 'Imagem em base64 inválida')
  }

  if (estimatedBytes > MAX_ANALYZE_IMAGE_BYTES) {
    throw new AnalyzeValidationError(413, 'Imagem excede o limite de 2MB')
  }

  let decoded: string
  try {
    decoded = atob(normalizedBase64)
  } catch {
    throw new AnalyzeValidationError(400, 'Imagem em base64 inválida')
  }

  const binaryImage = Uint8Array.from(decoded, (ch) => ch.charCodeAt(0))
  if (binaryImage.byteLength > MAX_ANALYZE_IMAGE_BYTES) {
    throw new AnalyzeValidationError(413, 'Imagem excede o limite de 2MB')
  }

  return { normalizedBase64, binaryImage }
}

async function withAnalysisTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined

  try {
    return await Promise.race([
      promise,
      new Promise<never>((_resolve, reject) => {
        timer = setTimeout(() => reject(new Error(ANALYZE_TIMEOUT_ERROR)), timeoutMs)
      }),
    ])
  } finally {
    if (timer !== undefined) {
      clearTimeout(timer)
    }
  }
}

function mapAnalyzeError(error: unknown): AnalyzeMappedError | null {
  if (error instanceof SyntaxError || error instanceof z.ZodError) {
    return {
      status: 422,
      error: 'A IA não conseguiu analisar a imagem. Tente outra foto.',
    }
  }

  const statusFromError = typeof error === 'object' && error !== null && 'status' in error
    ? Number((error as { status?: unknown }).status)
    : null
  if (statusFromError === 429) {
    return {
      status: 429,
      error: 'Limite da IA atingido no momento. Tente novamente em instantes.',
    }
  }
  if (statusFromError === 400 || statusFromError === 404) {
    return {
      status: 422,
      error: 'A IA não conseguiu analisar esta imagem. Tente outra foto mais nítida.',
    }
  }
  if (statusFromError === 503) {
    return {
      status: 503,
      error: 'Serviço de análise indisponível no momento. Tente novamente em instantes.',
    }
  }

  const message = error instanceof Error ? error.message.toLowerCase() : ''
  const includes = (terms: string[]) => terms.some((term) => message.includes(term))

  if (includes([ANALYZE_TIMEOUT_ERROR.toLowerCase(), 'timeout', 'timed out', 'deadline'])) {
    return {
      status: 503,
      error: 'Tempo limite da análise atingido. Tente novamente em instantes.',
    }
  }

  if (includes(['400', 'bad request', 'invalid argument', 'invalid_argument', 'invalid image', 'unsupported image'])) {
    return {
      status: 422,
      error: 'A IA não conseguiu analisar esta imagem. Tente outra foto mais nítida.',
    }
  }

  if (includes(['429', 'resource_exhausted', 'quota', 'rate limit', 'too many requests'])) {
    return {
      status: 429,
      error: 'Limite da IA atingido no momento. Tente novamente em instantes.',
    }
  }

  if (includes(['503', 'service unavailable', 'temporarily unavailable', 'unavailable', 'overloaded'])) {
    return {
      status: 503,
      error: 'Serviço de análise indisponível no momento. Tente novamente em instantes.',
    }
  }

  return null
}

function normalizeIdempotencyKey(rawValue: string | undefined) {
  const normalized = rawValue?.trim()
  if (!normalized) {
    return null
  }

  if (!IDEMPOTENCY_KEY_PATTERN.test(normalized)) {
    return null
  }

  return normalized
}

function buildManualPayloadHashInput(
  userId: string,
  payload: ManualPayload
) {
  return JSON.stringify({
    userId,
    name: payload.name.trim(),
    mealType: payload.mealType,
    calories: payload.calories,
    protein: payload.protein,
    carbs: payload.carbs,
    fat: payload.fat,
    localDate: payload.localDate,
    imageKey: payload.imageKey ?? null,
    analysisToken: payload.analysisToken ?? null,
    foodsDetected: payload.foodsDetected ?? [],
    aiConfidence: payload.aiConfidence ?? null,
    isManualEntry: payload.isManualEntry ?? true,
  })
}

async function sha256Hex(input: string) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(input))
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('')
}

function serializeFoodsDetected(input: ManualPayload['foodsDetected']) {
  if (!input || input.length === 0) {
    return null
  }
  return JSON.stringify(input)
}

function mapMealSelectRow(row: MealSelectRow) {
  return {
    id: row.id,
    userId: row.userId,
    imageKey: row.imageKey,
    mealType: row.mealType,
    name: row.name,
    calories: row.calories,
    protein: row.protein,
    carbs: row.carbs,
    fat: row.fat,
    foodsDetected: row.foodsDetected,
    aiConfidence: row.aiConfidence,
    isManualEntry: Boolean(row.isManualEntry),
    localDate: row.localDate,
    loggedAt: row.loggedAt,
    createdAt: row.createdAt,
    deletedAt: row.deletedAt,
  }
}

async function findMealById(d1: D1Database, userId: string, mealId: string) {
  const meal = await d1.prepare(`
    SELECT
      id,
      user_id AS userId,
      image_key AS imageKey,
      meal_type AS mealType,
      name,
      calories,
      protein,
      carbs,
      fat,
      foods_detected AS foodsDetected,
      ai_confidence AS aiConfidence,
      is_manual_entry AS isManualEntry,
      local_date AS localDate,
      logged_at AS loggedAt,
      created_at AS createdAt,
      deleted_at AS deletedAt
    FROM meals
    WHERE id = ? AND user_id = ?
    LIMIT 1
  `).bind(mealId, userId).first<MealSelectRow>()

  return meal ? mapMealSelectRow(meal) : null
}

async function getUserTimezone(d1: D1Database, userId: string) {
  const profile = await d1.prepare(`
    SELECT user_timezone AS userTimezone
    FROM user_profiles
    WHERE user_id = ? AND deleted_at IS NULL
    LIMIT 1
  `).bind(userId).first<{ userTimezone: string | null }>()

  return profile?.userTimezone ?? null
}

async function resolveManualIdempotency(
  c: Context<MealEnv>,
  userId: string,
  idempotencyKey: string,
  requestHash: string
) {
  const existing = await c.env.DB.prepare(`
    SELECT request_hash AS requestHash, meal_id AS mealId
    FROM meal_idempotency_keys
    WHERE user_id = ? AND idempotency_key = ?
    LIMIT 1
  `).bind(userId, idempotencyKey).first<MealIdempotencyRow>()

  if (!existing) {
    return null
  }

  if (existing.requestHash !== requestHash) {
    return c.json(
      {
        error: 'Idempotency-Key reutilizada com payload diferente',
        code: 'IDEMPOTENCY_KEY_CONFLICT',
      },
      409
    )
  }

  if (!existing.mealId) {
    return c.json(
      {
        error: 'Requisição idempotente em processamento. Tente novamente em instantes.',
        code: 'IDEMPOTENCY_KEY_IN_PROGRESS',
      },
      409
    )
  }

  const meal = await findMealById(c.env.DB, userId, existing.mealId)
  if (!meal) {
    return c.json(
      {
        error: 'Requisição idempotente inconsistente. Reenvie com uma nova chave.',
        code: 'IDEMPOTENCY_KEY_STALE',
      },
      409
    )
  }

  return c.json({ meal, replayed: true }, 200)
}

// All routes require auth
mealRoutes.use('/*', authMiddleware)

// POST /meals/analyze -- AI food analysis
const analyzeSchema = z.object({
  imageBase64: z.string().min(100),
  mealType: z.enum(['breakfast', 'lunch', 'dinner', 'snack']),
  localDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(), // backward compatibility
})

mealRoutes.post('/analyze', analyzeContentLengthGuard, jsonValidator(analyzeSchema), async (c) => {
  const { imageBase64, mealType, localDate } = c.req.valid('json')
  const userId = c.var.user.id
  const userTimezone = await getUserTimezone(c.env.DB, userId)
  const effectiveLocalDate = localDate ?? (userTimezone ? getDateForTimezone(userTimezone) : null)
  let reservedAnalysisEventId: string | null = null

  try {
    if (!effectiveLocalDate) {
      return c.json({
        error: 'Timezone do usuário não configurado',
        code: 'TIMEZONE_REQUIRED',
      }, 428)
    }

    if (!c.env.GEMINI_API_KEY) {
      return c.json({ error: 'Serviço de análise indisponível no momento' }, 503)
    }

    if (!c.env.R2) {
      return c.json({
        error: 'Serviço de mídia indisponível no momento',
        code: 'MEDIA_STORAGE_UNAVAILABLE',
      }, 503)
    }

    const { normalizedBase64, binaryImage } = parseAnalyzeImageBase64(imageBase64)

    // Register analysis event for daily limit accounting (atomic guard against races)
    const analysisEventId = crypto.randomUUID()
    const rateInsert = await c.env.DB.prepare(`
      INSERT INTO analysis_events (id, user_id, local_date, created_at)
      SELECT ?, ?, ?, ?
      WHERE (
        SELECT COUNT(*)
        FROM analysis_events
        WHERE user_id = ? AND local_date = ?
      ) < 50
    `).bind(
      analysisEventId,
      userId,
      effectiveLocalDate,
      Date.now(),
      userId,
      effectiveLocalDate
    ).run()

    const insertedRows = Number(rateInsert.meta?.changes ?? 0)
    if (insertedRows === 0) {
      return c.json({
        error: 'Limite de análises atingido',
        mensagem: 'Você atingiu o limite de 50 análises por dia. Tente novamente amanhã.',
        limite: 50,
        usado: 50,
      }, 429)
    }
    reservedAnalysisEventId = analysisEventId

    // Analyze with Gemini
    const nutrition = await withAnalysisTimeout(
      analyzeFood(c.env.GEMINI_API_KEY, normalizedBase64),
      ANALYZE_TIMEOUT_MS
    )

    if (nutrition.confidence === 'low') {
      await releaseAnalysisEventSlot(c.env.DB, reservedAnalysisEventId, userId, effectiveLocalDate)
      reservedAnalysisEventId = null
      return c.json({
        error: 'A IA não teve confiança suficiente nesta imagem. Tente outra foto com melhor iluminação.',
      }, 422)
    }

    // Upload to R2 and register upload ownership token.
    const imageKey = `${userId}/${effectiveLocalDate}/${crypto.randomUUID()}.jpg`
    await c.env.R2.put(imageKey, binaryImage)
    let analysisToken = ''
    try {
      analysisToken = await registerUploadedMedia(c.env.DB, userId, imageKey)
    } catch (error) {
      await c.env.R2.delete(imageKey)
      throw error
    }

    return c.json({
      analysis: {
        imageKey,
        analysisToken,
        mealType,
        localDate: effectiveLocalDate,
        mealName: nutrition.mealName,
        foods: nutrition.foods,
        totals: nutrition.totals,
        confidence: nutrition.confidence,
      },
    })
  } catch (error) {
    if (reservedAnalysisEventId && effectiveLocalDate) {
      await releaseAnalysisEventSlot(c.env.DB, reservedAnalysisEventId, userId, effectiveLocalDate)
      reservedAnalysisEventId = null
    }

    if (error instanceof AnalyzeValidationError) {
      return c.json({ error: error.message }, error.status)
    }

    const mapped = mapAnalyzeError(error)
    if (mapped) {
      return c.json({ error: mapped.error }, mapped.status)
    }

    throw error
  }
})

// POST /meals/manual -- Manual entry
const manualSchema = z.object({
  name: z.string().min(1).max(200),
  mealType: z.enum(['breakfast', 'lunch', 'dinner', 'snack']),
  calories: z.number().min(0).max(5000),
  protein: z.number().min(0).max(500),
  carbs: z.number().min(0).max(1000),
  fat: z.number().min(0).max(500),
  localDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  imageKey: z.string().min(1).optional(),
  analysisToken: z.string().min(1).optional(),
  foodsDetected: z.array(z.object({
    name: z.string(),
    portion: z.string(),
    calories: z.number(),
    protein: z.number(),
    carbs: z.number(),
    fat: z.number(),
  })).optional(),
  aiConfidence: z.enum(['high', 'medium', 'low']).optional(),
  isManualEntry: z.boolean().optional(),
})

mealRoutes.post('/manual', jsonValidator(manualSchema), async (c) => {
  const data = c.req.valid('json')
  const userId = c.var.user.id

  if (data.imageKey && !data.analysisToken) {
    return c.json(
      {
        error: 'analysisToken obrigatório para anexar imagem',
        code: 'MEDIA_TOKEN_REQUIRED',
      },
      400
    )
  }

  if (!data.imageKey && data.analysisToken) {
    return c.json(
      {
        error: 'analysisToken inválido sem imageKey',
        code: 'MEDIA_TOKEN_INVALID',
      },
      400
    )
  }

  if (data.imageKey && data.analysisToken) {
    const mediaValidation = await validateUploadedMediaOwnership(c.env.DB, userId, data.analysisToken, data.imageKey)
    if (!mediaValidation.ok) {
      return c.json(mediaValidation.body, mediaValidation.status)
    }
  }

  const idempotencyKey = normalizeIdempotencyKey(c.req.header(IDEMPOTENCY_KEY_HEADER))
  if (!idempotencyKey) {
    return c.json(
      {
        error: 'Cabeçalho Idempotency-Key obrigatório e inválido',
        code: 'IDEMPOTENCY_KEY_REQUIRED',
      },
      400
    )
  }

  const requestHash = await sha256Hex(buildManualPayloadHashInput(userId, data))
  const existingResponse = await resolveManualIdempotency(c, userId, idempotencyKey, requestHash)
  if (existingResponse) {
    return existingResponse
  }

  const reservation = await c.env.DB.prepare(`
    INSERT INTO meal_idempotency_keys (id, user_id, idempotency_key, request_hash, created_at)
    SELECT ?, ?, ?, ?, ?
    WHERE NOT EXISTS (
      SELECT 1
      FROM meal_idempotency_keys
      WHERE user_id = ? AND idempotency_key = ?
    )
  `).bind(
    crypto.randomUUID(),
    userId,
    idempotencyKey,
    requestHash,
    Date.now(),
    userId,
    idempotencyKey
  ).run()

  if (Number(reservation.meta?.changes ?? 0) === 0) {
    const racedResponse = await resolveManualIdempotency(c, userId, idempotencyKey, requestHash)
    if (racedResponse) {
      return racedResponse
    }

    return c.json(
      {
        error: 'Não foi possível reservar a chave de idempotência',
        code: 'IDEMPOTENCY_KEY_RESERVATION_FAILED',
      },
      409
    )
  }

  const mealId = crypto.randomUUID()
  const loggedAt = new Date().toISOString()
  const createdAt = Date.now()
  let mealInserted = false

  try {
    await c.env.DB.prepare(`
      INSERT INTO meals (
        id,
        user_id,
        image_key,
        meal_type,
        name,
        calories,
        protein,
        carbs,
        fat,
        foods_detected,
        ai_confidence,
        is_manual_entry,
        local_date,
        logged_at,
        created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(
      mealId,
      userId,
      data.imageKey ?? null,
      data.mealType,
      data.name.trim(),
      data.calories,
      data.protein,
      data.carbs,
      data.fat,
      serializeFoodsDetected(data.foodsDetected),
      data.aiConfidence ?? null,
      data.isManualEntry ?? true ? 1 : 0,
      data.localDate,
      loggedAt,
      createdAt
    ).run()
    mealInserted = true

    if (data.imageKey && data.analysisToken) {
      const attached = await attachMediaToMeal(c.env.DB, userId, data.analysisToken, mealId, data.imageKey)
      if (!attached) {
        throw new Error('Falha ao anexar mídia à refeição')
      }
    }

    await c.env.DB.prepare(`
      UPDATE meal_idempotency_keys
      SET meal_id = ?
      WHERE user_id = ? AND idempotency_key = ? AND request_hash = ?
    `).bind(mealId, userId, idempotencyKey, requestHash).run()

    const meal = await findMealById(c.env.DB, userId, mealId)
    if (!meal) {
      throw new Error('Refeição criada, mas não encontrada na leitura de confirmação')
    }

    return c.json({ meal }, 201)
  } catch (error) {
    if (mealInserted) {
      await c.env.DB.prepare(`
        DELETE FROM meals
        WHERE id = ? AND user_id = ?
      `).bind(mealId, userId).run()
    }

    await c.env.DB.prepare(`
      DELETE FROM meal_idempotency_keys
      WHERE user_id = ? AND idempotency_key = ? AND meal_id IS NULL
    `).bind(userId, idempotencyKey).run()

    throw error
  }
})

// GET /meals?date=YYYY-MM-DD -- Get meals for a date
const dateQuerySchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
})

mealRoutes.get('/', queryValidator(dateQuerySchema), async (c) => {
  const userId = c.var.user.id
  const { date } = c.req.valid('query')
  const db = drizzle(c.env.DB, { schema })

  const result = await db.select()
    .from(schema.meals)
    .where(
      and(
        eq(schema.meals.userId, userId),
        eq(schema.meals.localDate, date),
        isNull(schema.meals.deletedAt)
      )
    )
    .orderBy(desc(schema.meals.loggedAt))

  return c.json({ meals: result })
})

// GET /meals/history?days=7 -- Get recent history
const historyQuerySchema = z.object({
  days: z.coerce.number().int().min(1).max(7).default(7),
})

mealRoutes.get('/history', queryValidator(historyQuerySchema), async (c) => {
  const userId = c.var.user.id
  const { days } = c.req.valid('query')
  const db = drizzle(c.env.DB, { schema })

  const summaries = await db.select()
    .from(schema.dailySummaries)
    .where(eq(schema.dailySummaries.userId, userId))
    .orderBy(desc(schema.dailySummaries.date))
    .limit(days)

  return c.json({ history: summaries })
})

// DELETE /meals/:id -- Soft delete
const deleteMealParamsSchema = z.object({
  id: z.string().min(1),
})

mealRoutes.delete('/:id', paramValidator(deleteMealParamsSchema), async (c) => {
  const userId = c.var.user.id
  const { id: mealId } = c.req.valid('param')
  const meal = await c.env.DB.prepare(`
    SELECT id, local_date, image_key
    FROM meals
    WHERE id = ? AND user_id = ? AND deleted_at IS NULL
  `).bind(mealId, userId).first<{ id: string; local_date: string; image_key: string | null }>()

  if (!meal) {
    return c.json({ error: 'Refeição não encontrada' }, 404)
  }

  await c.env.DB.prepare(`
    UPDATE meals
    SET deleted_at = ?
    WHERE id = ? AND user_id = ? AND deleted_at IS NULL
  `).bind(Date.now(), mealId, userId).run()

  if (meal.image_key) {
    await markMealMediaForDeletion(c.env.DB, userId, meal.image_key, mealId)
  }

  return c.json({ ok: true })
})

async function releaseAnalysisEventSlot(d1: D1Database, eventId: string, userId: string, localDate: string) {
  try {
    await d1.prepare(`
      DELETE FROM analysis_events
      WHERE id = ? AND user_id = ? AND local_date = ?
    `).bind(eventId, userId, localDate).run()
  } catch {
    // best effort cleanup to avoid queuing false-positive usage on failed analyses
  }
}

export { mealRoutes }
