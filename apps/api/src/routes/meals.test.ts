import { beforeEach, describe, expect, it, mock } from 'bun:test'
import { Hono } from 'hono'
import type { Env } from '../types'

type SessionUser = { id: string; email: string; name: string }
type SessionData = {
  user: SessionUser
  session: { id: string; userId: string; token: string }
}

const TEST_USER: SessionUser = { id: 'user_1', email: 'user@example.com', name: 'User' }

let analyzeImpl: (apiKey: string, imageBase64: string) => Promise<{
  mealName: string
  confidence: 'high' | 'medium' | 'low'
  foods: Array<{ name: string; portion: string; calories: number; protein: number; carbs: number; fat: number }>
  totals: { calories: number; protein: number; carbs: number; fat: number }
}> = async () => ({
  mealName: 'Prato teste',
  confidence: 'high',
  foods: [{ name: 'Arroz', portion: '100g', calories: 130, protein: 2.4, carbs: 28, fat: 0.3 }],
  totals: { calories: 130, protein: 2.4, carbs: 28, fat: 0.3 },
})

mock.module('../services/gemini', () => ({
  analyzeFood: (apiKey: string, imageBase64: string) => analyzeImpl(apiKey, imageBase64),
}))

mock.module('../lib/auth', () => ({
  createAuth: () => ({
    api: {
      getSession: async (): Promise<SessionData> => ({
        user: TEST_USER,
        session: { id: 'session_1', userId: TEST_USER.id, token: 'token_1' },
      }),
    },
  }),
}))

const { mealRoutes } = await import('./meals')

type QueryLog = {
  sql: string
  params: unknown[]
}

type MockDbOptions = {
  analysisCount?: number
  mealToDelete?: { id: string; userId: string; localDate: string }
  rateInsertChanges?: number
  idempotencyInsertChanges?: number
  userTimezone?: string | null
  existingIdempotency?: {
    requestHash: string
    mealId: string | null
    state?: 'in_progress' | 'completed'
    responseStatus?: number | null
    responseBody?: string | null
  }
  existingMediaObject?: {
    id: string
    userId: string
    imageKey: string
    mealId: string | null
    status: 'uploaded' | 'attached' | 'pending_delete' | 'delete_failed' | 'deleted'
    deleteAfter: number | null
    attemptCount: number
  }
  mealById?: {
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
}

function createMockD1(options: MockDbOptions = {}): { db: D1Database; logs: QueryLog[] } {
  const logs: QueryLog[] = []

  const db = {
    prepare(sql: string) {
      return {
        bind(...params: unknown[]) {
          logs.push({ sql, params })
          const normalizedSql = sql.toLowerCase()

          return {
            async first<T>() {
              if (normalizedSql.includes('count(*) as count') && normalizedSql.includes('analysis_events')) {
                return { count: options.analysisCount ?? 0 } as T
              }

              if (normalizedSql.includes('from user_profiles') && normalizedSql.includes('user_timezone')) {
                if (options.userTimezone === null) {
                  return null as T
                }
                return { userTimezone: options.userTimezone ?? 'America/Sao_Paulo' } as T
              }

              if (normalizedSql.includes('from media_objects')) {
                return (options.existingMediaObject ?? null) as T
              }

              if (normalizedSql.includes('from meal_idempotency_keys')) {
                if (!options.existingIdempotency) {
                  return null as T
                }
                return {
                  requestHash: options.existingIdempotency.requestHash,
                  mealId: options.existingIdempotency.mealId,
                  state: options.existingIdempotency.state ?? (options.existingIdempotency.mealId ? 'completed' : 'in_progress'),
                  responseStatus: options.existingIdempotency.responseStatus ?? null,
                  responseBody: options.existingIdempotency.responseBody ?? null,
                } as T
              }

              if (normalizedSql.includes('select id, local_date') && normalizedSql.includes('from meals') && options.mealToDelete) {
                return {
                  id: options.mealToDelete.id,
                  local_date: options.mealToDelete.localDate,
                  image_key: `${options.mealToDelete.userId}/${options.mealToDelete.localDate}/image.jpg`,
                  user_id: options.mealToDelete.userId,
                } as T
              }

              if (
                normalizedSql.includes('from meals') &&
                normalizedSql.includes('userid') &&
                normalizedSql.includes('mealtype')
              ) {
                if (options.mealById) {
                  return options.mealById as T
                }
                const [mealId, userId] = params as [string, string]
                return {
                  id: mealId,
                  userId,
                  imageKey: null,
                  mealType: 'lunch',
                  name: 'Arroz e frango',
                  calories: 540,
                  protein: 42,
                  carbs: 53,
                  fat: 16,
                  foodsDetected: null,
                  aiConfidence: null,
                  isManualEntry: 1,
                  localDate: '2026-03-03',
                  loggedAt: '2026-03-03T12:00:00.000Z',
                  createdAt: Date.now(),
                  deletedAt: null,
                } as T
              }

              if (normalizedSql.includes('coalesce(sum(calories)')) {
                return {
                  total_calories: 0,
                  total_protein: 0,
                  total_carbs: 0,
                  total_fat: 0,
                  meals_count: 0,
                } as T
              }

              return null as T
            },

            async all<T>() {
              return { results: [] as T[] }
            },

            async run() {
              if (normalizedSql.includes('insert into analysis_events')) {
                return {
                  success: true,
                  meta: { changes: options.rateInsertChanges ?? 1 },
                }
              }

              if (normalizedSql.includes('insert into meal_idempotency_keys')) {
                return {
                  success: true,
                  meta: { changes: options.idempotencyInsertChanges ?? 1 },
                }
              }

              return {
                success: true,
                meta: { changes: 1 },
              }
            },
          }
        },
      }
    },
  } as unknown as D1Database

  return { db, logs }
}

function createEnv(options: MockDbOptions = {}): { env: Env; logs: QueryLog[]; putCalls: number } {
  const { db, logs } = createMockD1(options)
  let putCalls = 0
  let deleteCalls = 0

  const env: Env = {
    DB: db,
    R2: {
      async put() {
        putCalls += 1
      },
      async delete() {
        deleteCalls += 1
      },
    } as unknown as R2Bucket,
    GEMINI_API_KEY: 'test-key',
    BETTER_AUTH_SECRET: 'test',
    BETTER_AUTH_URL: 'http://localhost:8787',
    ENVIRONMENT: 'test',
  }

  return {
    env,
    logs,
    get putCalls() {
      return putCalls
    },
    get deleteCalls() {
      return deleteCalls
    },
  }
}

function createApp() {
  const app = new Hono<{ Bindings: Env }>()
  app.route('/api/meals', mealRoutes)
  return app
}

function analyzeBody(overrides?: Partial<{ imageBase64: string; mealType: string; localDate: string }>) {
  return {
    imageBase64: overrides?.imageBase64 ?? 'data:image/jpeg;base64,' + btoa('x'.repeat(300)),
    mealType: overrides?.mealType ?? 'lunch',
    localDate: overrides?.localDate ?? '1999-01-01',
  }
}

async function manualPayloadHash(input: {
  name: string
  mealType: 'breakfast' | 'lunch' | 'dinner' | 'snack'
  calories: number
  protein: number
  carbs: number
  fat: number
  localDate: string
  imageKey?: string
  analysisToken?: string
  foodsDetected?: Array<{ name: string; portion: string; calories: number; protein: number; carbs: number; fat: number }>
  aiConfidence?: 'high' | 'medium' | 'low'
  isManualEntry?: boolean
}) {
  const canonicalPayload = JSON.stringify({
    userId: TEST_USER.id,
    name: input.name.trim(),
    mealType: input.mealType,
    calories: input.calories,
    protein: input.protein,
    carbs: input.carbs,
    fat: input.fat,
    localDate: input.localDate,
    imageKey: input.imageKey ?? null,
    analysisToken: input.analysisToken ?? null,
    foodsDetected: input.foodsDetected ?? [],
    aiConfidence: input.aiConfidence ?? null,
    isManualEntry: input.isManualEntry ?? true,
  })

  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(canonicalPayload))
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('')
}

describe('mealRoutes regressions', () => {
  beforeEach(() => {
    analyzeImpl = async () => ({
      mealName: 'Prato teste',
      confidence: 'high',
      foods: [{ name: 'Arroz', portion: '100g', calories: 130, protein: 2.4, carbs: 28, fat: 0.3 }],
      totals: { calories: 130, protein: 2.4, carbs: 28, fat: 0.3 },
    })
  })

  it('usa localDate do cliente no /analyze para cota e resposta', async () => {
    const app = createApp()
    const { env, logs } = createEnv({ analysisCount: 0 })
    const clientDate = '1999-01-01'

    const response = await app.request(
      'http://localhost/api/meals/analyze',
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(analyzeBody({ localDate: clientDate })),
      },
      env
    )

    const body = await response.json() as { analysis: { localDate: string } }
    const insertLog = logs.find((entry) => entry.sql.toLowerCase().includes('insert into analysis_events'))

    expect(response.status).toBe(200)
    expect(body.analysis.localDate).toBe(clientDate)
    expect(insertLog?.params).toContain(clientDate)
  })

  it('usa timezone do usuário quando localDate não é enviado no /analyze', async () => {
    const app = createApp()
    const { env, logs } = createEnv({
      analysisCount: 0,
      userTimezone: 'Pacific/Kiritimati',
    })

    const response = await app.request(
      'http://localhost/api/meals/analyze',
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          imageBase64: 'data:image/jpeg;base64,' + btoa('x'.repeat(300)),
          mealType: 'lunch',
        }),
      },
      env
    )

    const body = await response.json() as { analysis: { localDate: string } }
    const insertLog = logs.find((entry) => entry.sql.toLowerCase().includes('insert into analysis_events'))

    expect(response.status).toBe(200)
    expect(insertLog?.params[2]).toBe(body.analysis.localDate)
    expect(body.analysis.localDate).toMatch(/^\d{4}-\d{2}-\d{2}$/)
  })

  it('retorna 428 quando localDate ausente e usuário sem timezone', async () => {
    const app = createApp()
    const { env } = createEnv({
      analysisCount: 0,
      userTimezone: null,
    })

    const response = await app.request(
      'http://localhost/api/meals/analyze',
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          imageBase64: 'data:image/jpeg;base64,' + btoa('x'.repeat(300)),
          mealType: 'lunch',
        }),
      },
      env
    )

    expect(response.status).toBe(428)
  })

  it('retorna 428 quando localDate ausente e timezone persistido é inválido', async () => {
    const app = createApp()
    const { env, logs } = createEnv({
      analysisCount: 0,
      userTimezone: 'Invalid/Timezone',
    })

    const response = await app.request(
      'http://localhost/api/meals/analyze',
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          imageBase64: 'data:image/jpeg;base64,' + btoa('x'.repeat(300)),
          mealType: 'lunch',
        }),
      },
      env
    )

    const body = await response.json() as { code: string }
    const insertLog = logs.find((entry) => entry.sql.toLowerCase().includes('insert into analysis_events'))

    expect(response.status).toBe(428)
    expect(body.code).toBe('TIMEZONE_REQUIRED')
    expect(insertLog).toBeUndefined()
  })

  it('exige Idempotency-Key no POST /manual', async () => {
    const app = createApp()
    const { env } = createEnv()

    const response = await app.request(
      'http://localhost/api/meals/manual',
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          name: 'Arroz e frango',
          mealType: 'lunch',
          calories: 540,
          protein: 42,
          carbs: 53,
          fat: 16,
          localDate: '2026-03-03',
          isManualEntry: true,
        }),
      },
      env
    )

    const body = await response.json() as { code: string }
    expect(response.status).toBe(400)
    expect(body.code).toBe('IDEMPOTENCY_KEY_REQUIRED')
  })

  it('retorna 422 problem+json quando Idempotency-Key é reutilizada com payload diferente', async () => {
    const app = createApp()
    const { env } = createEnv({
      existingIdempotency: {
        requestHash: 'hash_anterior',
        mealId: null,
      },
    })

    const response = await app.request(
      'http://localhost/api/meals/manual',
      {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'idempotency-key': 'meal-conflict-1234',
        },
        body: JSON.stringify({
          name: 'Arroz e frango',
          mealType: 'lunch',
          calories: 540,
          protein: 42,
          carbs: 53,
          fat: 16,
          localDate: '2026-03-03',
          isManualEntry: true,
        }),
      },
      env
    )

    const body = await response.json() as { code: string }
    expect(response.status).toBe(422)
    expect(response.headers.get('content-type')).toContain('application/problem+json')
    expect(body.code).toBe('IDEMPOTENCY_KEY_CONFLICT')
  })

  it('retorna replay com status/body persistidos sem normalização quando Idempotency-Key já foi processada', async () => {
    const app = createApp()
    const payload = {
      name: 'Arroz e frango',
      mealType: 'lunch' as const,
      calories: 540,
      protein: 42,
      carbs: 53,
      fat: 16,
      localDate: '2026-03-03',
      isManualEntry: true,
    }
    const requestHash = await manualPayloadHash(payload)
    const replayMealId = 'meal_replay_1'
    const replayBody = JSON.stringify({
      meal: {
        id: replayMealId,
        userId: TEST_USER.id,
        imageKey: null,
        mealType: payload.mealType,
        name: payload.name,
        calories: payload.calories,
        protein: payload.protein,
        carbs: payload.carbs,
        fat: payload.fat,
        foodsDetected: null,
        aiConfidence: null,
        isManualEntry: true,
        localDate: payload.localDate,
        loggedAt: '2026-03-03T12:00:00.000Z',
        createdAt: Date.now(),
        deletedAt: null,
      },
      replayMeta: {
        source: 'stored',
      },
    })

    const { env, logs } = createEnv({
      existingIdempotency: {
        requestHash,
        mealId: replayMealId,
        state: 'completed',
        responseStatus: 202,
        responseBody: replayBody,
      },
    })

    const response = await app.request(
      'http://localhost/api/meals/manual',
      {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'idempotency-key': 'meal-replay-1234',
        },
        body: JSON.stringify(payload),
      },
      env
    )

    const bodyText = await response.text()
    const body = JSON.parse(bodyText) as { meal: { id: string }; replayMeta: { source: string } }
    const insertMealLog = logs.find((entry) => entry.sql.toLowerCase().includes('insert into meals'))

    expect(response.status).toBe(202)
    expect(bodyText).toBe(replayBody)
    expect(body.meal.id).toBe(replayMealId)
    expect(body.replayMeta.source).toBe('stored')
    expect(response.headers.get('idempotency-replayed')).toBe('true')
    expect(insertMealLog).toBeUndefined()
  })

  it('retorna 409 stale quando registro idempotente completed não possui replay persistido', async () => {
    const app = createApp()
    const payload = {
      name: 'Arroz e frango',
      mealType: 'lunch' as const,
      calories: 540,
      protein: 42,
      carbs: 53,
      fat: 16,
      localDate: '2026-03-03',
      isManualEntry: true,
    }
    const requestHash = await manualPayloadHash(payload)

    const { env } = createEnv({
      existingIdempotency: {
        requestHash,
        mealId: 'meal_old_1',
        state: 'completed',
        responseStatus: null,
        responseBody: null,
      },
    })

    const response = await app.request(
      'http://localhost/api/meals/manual',
      {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'idempotency-key': 'meal-stale-1234',
        },
        body: JSON.stringify(payload),
      },
      env
    )

    const body = await response.json() as { code: string }
    expect(response.status).toBe(409)
    expect(body.code).toBe('IDEMPOTENCY_KEY_STALE')
  })

  it('reproduz replay idempotente para payload com mídia mesmo quando token já está attached', async () => {
    const app = createApp()
    const payload = {
      name: 'Arroz e frango',
      mealType: 'lunch' as const,
      calories: 540,
      protein: 42,
      carbs: 53,
      fat: 16,
      localDate: '2026-03-03',
      imageKey: 'user_1/2026-03-03/image.jpg',
      analysisToken: 'media_attached_1',
      isManualEntry: true,
    }
    const requestHash = await manualPayloadHash(payload)
    const replayMealId = 'meal_replay_media_1'
    const replayBody = JSON.stringify({
      meal: {
        id: replayMealId,
      },
    })

    const { env, logs } = createEnv({
      existingIdempotency: {
        requestHash,
        mealId: replayMealId,
        state: 'completed',
        responseStatus: 201,
        responseBody: replayBody,
      },
      existingMediaObject: {
        id: 'media_attached_1',
        userId: TEST_USER.id,
        imageKey: payload.imageKey,
        mealId: 'meal_existente',
        status: 'attached',
        deleteAfter: null,
        attemptCount: 1,
      },
    })

    const response = await app.request(
      'http://localhost/api/meals/manual',
      {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'idempotency-key': 'meal-media-replay-1234',
        },
        body: JSON.stringify(payload),
      },
      env
    )

    const replayText = await response.text()
    const mediaQueryLog = logs.find((entry) => entry.sql.toLowerCase().includes('from media_objects'))

    expect(response.status).toBe(201)
    expect(response.headers.get('idempotency-replayed')).toBe('true')
    expect(replayText).toBe(replayBody)
    expect(mediaQueryLog).toBeUndefined()
  })

  it('retorna 201 e ecoa Idempotency-Key em criação manual bem-sucedida', async () => {
    const app = createApp()
    const { env, logs } = createEnv()

    const response = await app.request(
      'http://localhost/api/meals/manual',
      {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'idempotency-key': 'meal-created-1234',
        },
        body: JSON.stringify({
          name: 'Arroz e frango',
          mealType: 'lunch',
          calories: 540,
          protein: 42,
          carbs: 53,
          fat: 16,
          localDate: '2026-03-03',
          isManualEntry: true,
        }),
      },
      env
    )

    expect(response.status).toBe(201)
    expect(response.headers.get('idempotency-key')).toBe('meal-created-1234')
    const reservationInsert = logs.find((entry) => entry.sql.toLowerCase().includes('insert into meal_idempotency_keys'))
    expect(reservationInsert).toBeDefined()
    const createdAt = Number(reservationInsert?.params[5])
    const expiresAt = Number(reservationInsert?.params[7])
    expect(Number.isFinite(createdAt)).toBe(true)
    expect(Number.isFinite(expiresAt)).toBe(true)
    expect(expiresAt - createdAt).toBe(24 * 60 * 60 * 1000)
  })

  it('retorna 409 + Retry-After quando requisição idempotente ainda está em processamento', async () => {
    const app = createApp()
    const payload = {
      name: 'Arroz e frango',
      mealType: 'lunch' as const,
      calories: 540,
      protein: 42,
      carbs: 53,
      fat: 16,
      localDate: '2026-03-03',
      isManualEntry: true,
    }
    const requestHash = await manualPayloadHash(payload)

    const { env } = createEnv({
      existingIdempotency: {
        requestHash,
        mealId: null,
        state: 'in_progress',
      },
    })

    const response = await app.request(
      'http://localhost/api/meals/manual',
      {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'idempotency-key': 'meal-in-progress-1234',
        },
        body: JSON.stringify(payload),
      },
      env
    )

    const body = await response.json() as { code: string }
    expect(response.status).toBe(409)
    expect(body.code).toBe('IDEMPOTENCY_KEY_IN_PROGRESS')
    expect(response.headers.get('retry-after')).toBe('2')
  })

  it('retorna 400 para base64 inválido e não tenta upload', async () => {
    const app = createApp()
    const state = createEnv({ analysisCount: 0 })

    const response = await app.request(
      'http://localhost/api/meals/analyze',
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(analyzeBody({ imageBase64: '!'.repeat(120) })),
      },
      state.env
    )

    const body = await response.json() as { error: string }
    expect(response.status).toBe(400)
    expect(body.error).toBe('Imagem em base64 inválida')
    expect(state.putCalls).toBe(0)
  })

  it('retorna 413 quando imagem excede 2MB', async () => {
    const app = createApp()
    const state = createEnv({ analysisCount: 0 })
    const oversized = 'A'.repeat(2_800_000)

    const response = await app.request(
      'http://localhost/api/meals/analyze',
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(analyzeBody({ imageBase64: oversized })),
      },
      state.env
    )

    const body = await response.json() as { error: string }
    expect(response.status).toBe(413)
    expect(body.error).toBe('Imagem excede o limite de 2MB')
    expect(state.putCalls).toBe(0)
  })

  it('retorna 413 para payload HTTP muito grande', async () => {
    const app = createApp()
    const state = createEnv({ analysisCount: 0 })
    const veryLargePayload = 'A'.repeat(4_500_000)

    const response = await app.request(
      'http://localhost/api/meals/analyze',
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(analyzeBody({ imageBase64: veryLargePayload })),
      },
      state.env
    )

    const body = await response.json() as { error: string }
    expect(response.status).toBe(413)
    expect(body.error).toBe('Imagem excede o limite de 2MB')
    expect(state.putCalls).toBe(0)
  })

  it('retorna 413 com content-length acima do limite sem processar análise', async () => {
    const app = createApp()
    const state = createEnv({ analysisCount: 0 })

    const response = await app.request(
      'http://localhost/api/meals/analyze',
      {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'content-length': String(4_600_000),
        },
        body: JSON.stringify(analyzeBody()),
      },
      state.env
    )

    const body = await response.json() as { error: string }
    expect(response.status).toBe(413)
    expect(body.error).toBe('Imagem excede o limite de 2MB')
  })

  it('retorna 429 quando reserva atômica não insere evento (corrida/limite)', async () => {
    const app = createApp()
    const { env } = createEnv({ analysisCount: 49, rateInsertChanges: 0 })

    const response = await app.request(
      'http://localhost/api/meals/analyze',
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(analyzeBody()),
      },
      env
    )

    expect(response.status).toBe(429)
  })

  it('retorna 429 para erros de quota do provedor de IA', async () => {
    const app = createApp()
    const state = createEnv({ analysisCount: 0 })
    analyzeImpl = async () => {
      throw new Error('429 RESOURCE_EXHAUSTED quota exceeded')
    }

    const response = await app.request(
      'http://localhost/api/meals/analyze',
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(analyzeBody()),
      },
      state.env
    )

    expect(response.status).toBe(429)
    const releaseLog = state.logs.find((entry) => entry.sql.toLowerCase().includes('delete from analysis_events'))
    expect(releaseLog).toBeDefined()
  })

  it('retorna 503 para timeout da análise', async () => {
    const app = createApp()
    const state = createEnv({ analysisCount: 0 })
    analyzeImpl = async () => {
      throw new Error('deadline exceeded: timeout')
    }

    const response = await app.request(
      'http://localhost/api/meals/analyze',
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(analyzeBody()),
      },
      state.env
    )

    expect(response.status).toBe(503)
    const releaseLog = state.logs.find((entry) => entry.sql.toLowerCase().includes('delete from analysis_events'))
    expect(releaseLog).toBeDefined()
  })

  it('retorna 503 para indisponibilidade 503 do provedor de IA', async () => {
    const app = createApp()
    const { env } = createEnv({ analysisCount: 0 })
    analyzeImpl = async () => {
      throw new Error('503 Service Unavailable')
    }

    const response = await app.request(
      'http://localhost/api/meals/analyze',
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(analyzeBody()),
      },
      env
    )

    expect(response.status).toBe(503)
  })

  it('retorna 422 para erro 400 do provedor de IA (imagem inválida)', async () => {
    const app = createApp()
    const state = createEnv({ analysisCount: 0 })
    analyzeImpl = async () => {
      const err = new Error('bad request: invalid argument')
      ;(err as Error & { status?: number }).status = 400
      throw err
    }

    const response = await app.request(
      'http://localhost/api/meals/analyze',
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(analyzeBody()),
      },
      state.env
    )

    expect(response.status).toBe(422)
    const releaseLog = state.logs.find((entry) => entry.sql.toLowerCase().includes('delete from analysis_events'))
    expect(releaseLog).toBeDefined()
  })

  it('retorna 422 e libera reserva quando IA responde confiança baixa', async () => {
    const app = createApp()
    const state = createEnv({ analysisCount: 0 })
    analyzeImpl = async () => ({
      mealName: 'Imagem ruim',
      confidence: 'low',
      foods: [{ name: 'Desconhecido', portion: '1 porção', calories: 100, protein: 2, carbs: 10, fat: 3 }],
      totals: { calories: 100, protein: 2, carbs: 10, fat: 3 },
    })

    const response = await app.request(
      'http://localhost/api/meals/analyze',
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(analyzeBody()),
      },
      state.env
    )

    expect(response.status).toBe(422)
    const releaseLog = state.logs.find((entry) => entry.sql.toLowerCase().includes('delete from analysis_events'))
    expect(releaseLog).toBeDefined()
  })

  it('faz soft delete com UPDATE escopado por user_id', async () => {
    const app = createApp()
    const { env, logs } = createEnv({
      mealToDelete: { id: 'meal_1', userId: TEST_USER.id, localDate: '2026-03-03' },
    })

    const response = await app.request(
      'http://localhost/api/meals/meal_1',
      { method: 'DELETE' },
      env
    )

    const updateLog = logs.find((entry) => entry.sql.toLowerCase().includes('update meals'))
    const lowerSql = updateLog?.sql.toLowerCase() ?? ''

    expect(response.status).toBe(200)
    expect(lowerSql).toContain('user_id')
    expect(updateLog?.params).toContain('meal_1')
    expect(updateLog?.params).toContain(TEST_USER.id)
  })

  it('marca mídia para deleção quando refeição deletada possui image_key', async () => {
    const app = createApp()
    const { env, logs } = createEnv({
      mealToDelete: { id: 'meal_2', userId: TEST_USER.id, localDate: '2026-03-03' },
    })
    const selectLog = logs.find((entry) => entry.sql.toLowerCase().includes('select id, local_date, image_key'))
    if (selectLog) {
      // Ensure the query path with image_key is exercised in this test suite.
      expect(selectLog.sql.toLowerCase()).toContain('image_key')
    }

    await app.request('http://localhost/api/meals/meal_2', { method: 'DELETE' }, env)

    const mediaUpdate = logs.find((entry) => entry.sql.toLowerCase().includes('update media_objects'))
    expect(mediaUpdate).toBeDefined()
  })

  it('rejeita imageKey sem analysisToken no POST /manual', async () => {
    const app = createApp()
    const { env } = createEnv()

    const response = await app.request(
      'http://localhost/api/meals/manual',
      {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'idempotency-key': 'manual-media-1234' },
        body: JSON.stringify({
          name: 'Arroz e frango',
          mealType: 'lunch',
          calories: 540,
          protein: 42,
          carbs: 53,
          fat: 16,
          localDate: '2026-03-03',
          imageKey: 'user_1/2026-03-03/img.jpg',
        }),
      },
      env
    )

    const body = await response.json() as { code: string }
    expect(response.status).toBe(400)
    expect(body.code).toBe('MEDIA_TOKEN_REQUIRED')
  })

  it('rejeita analysisToken sem imageKey no POST /manual', async () => {
    const app = createApp()
    const { env } = createEnv()

    const response = await app.request(
      'http://localhost/api/meals/manual',
      {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'idempotency-key': 'manual-media-5678' },
        body: JSON.stringify({
          name: 'Arroz e frango',
          mealType: 'lunch',
          calories: 540,
          protein: 42,
          carbs: 53,
          fat: 16,
          localDate: '2026-03-03',
          analysisToken: 'analysis_123',
        }),
      },
      env
    )

    const body = await response.json() as { code: string }
    expect(response.status).toBe(400)
    expect(body.code).toBe('MEDIA_TOKEN_INVALID')
  })

  it('rejeita token de mídia já anexado para evitar replay', async () => {
    const app = createApp()
    const { env } = createEnv({
      existingMediaObject: {
        id: 'media_attached_1',
        userId: TEST_USER.id,
        imageKey: 'user_1/2026-03-03/image.jpg',
        mealId: 'meal_existente',
        status: 'attached',
        deleteAfter: null,
        attemptCount: 0,
      },
    })

    const response = await app.request(
      'http://localhost/api/meals/manual',
      {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'idempotency-key': 'manual-media-9012' },
        body: JSON.stringify({
          name: 'Arroz e frango',
          mealType: 'lunch',
          calories: 540,
          protein: 42,
          carbs: 53,
          fat: 16,
          localDate: '2026-03-03',
          imageKey: 'user_1/2026-03-03/image.jpg',
          analysisToken: 'media_attached_1',
        }),
      },
      env
    )

    const body = await response.json() as { code: string }
    expect(response.status).toBe(409)
    expect(body.code).toBe('MEDIA_NOT_AVAILABLE')
  })

  it('retorna 503 quando GEMINI_API_KEY não está configurada', async () => {
    const app = createApp()
    const { env } = createEnv({ analysisCount: 0 })
    env.GEMINI_API_KEY = undefined

    const response = await app.request(
      'http://localhost/api/meals/analyze',
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(analyzeBody()),
      },
      env
    )

    expect(response.status).toBe(503)
  })

  it('mantém /analyze disponível quando R2 não está disponível (sem imageKey)', async () => {
    const app = createApp()
    const { env } = createEnv({ analysisCount: 0 })
    env.R2 = undefined

    const response = await app.request(
      'http://localhost/api/meals/analyze',
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(analyzeBody()),
      },
      env
    )

    const body = await response.json() as {
      analysis: {
        imageKey: string | null
        analysisToken: string
      }
    }
    expect(response.status).toBe(200)
    expect(body.analysis.imageKey).toBeNull()
    expect(body.analysis.analysisToken).toBe('')
  })

  it('retorna 409 + Retry-After quando reserva idempotente não consegue gravar estado inicial', async () => {
    const app = createApp()
    const { env } = createEnv({ idempotencyInsertChanges: 0 })

    const response = await app.request(
      'http://localhost/api/meals/manual',
      {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'idempotency-key': 'meal-reservation-failed-1234',
        },
        body: JSON.stringify({
          name: 'Arroz e frango',
          mealType: 'lunch',
          calories: 540,
          protein: 42,
          carbs: 53,
          fat: 16,
          localDate: '2026-03-03',
          isManualEntry: true,
        }),
      },
      env
    )

    const body = await response.json() as { code: string }
    expect(response.status).toBe(409)
    expect(response.headers.get('retry-after')).toBe('2')
    expect(body.code).toBe('IDEMPOTENCY_KEY_RESERVATION_FAILED')
  })

  it('retorna 404 ao deletar refeição inexistente', async () => {
    const app = createApp()
    const { env } = createEnv()

    const response = await app.request(
      'http://localhost/api/meals/meal_inexistente',
      { method: 'DELETE' },
      env
    )

    expect(response.status).toBe(404)
  })
})
