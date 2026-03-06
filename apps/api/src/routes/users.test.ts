import { describe, expect, it, mock } from 'bun:test'
import { Hono } from 'hono'
import type { Env } from '../types'

type SessionUser = { id: string; email: string; name: string }
type SessionData = {
  user: SessionUser
  session: { id: string; userId: string; token: string }
}

const TEST_USER: SessionUser = { id: 'user_1', email: 'user@example.com', name: 'User' }

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

const { userRoutes } = await import('./users')

type QueryLog = {
  sql: string
  params: unknown[]
}

function normalizeSql(sql: string) {
  return sql.toLowerCase().replaceAll('"', '').replaceAll('`', '')
}

function hasDeletedFilter(sql: string) {
  const normalized = normalizeSql(sql)
  return normalized.includes('user_profiles.deleted_at is null') || normalized.includes('deleted_at is null')
}

function createMockDb() {
  const logs: QueryLog[] = []
  const deletedProfileRow = [
    'profile_deleted',
    TEST_USER.id,
    'America/Sao_Paulo',
    'male',
    '1992-06-10',
    178,
    82,
    'moderate',
    'maintain',
    2000,
    120,
    200,
    70,
    Date.now(),
    Date.now(),
    Date.now(),
    Date.now(),
  ]

  const db = {
    prepare(sql: string) {
      return {
        bind(...params: unknown[]) {
          logs.push({ sql, params })
          const normalized = normalizeSql(sql)

          return {
            async first() {
              return null
            },

            async all() {
              if (normalized.includes('from user_profiles')) {
                if (hasDeletedFilter(sql)) {
                  return { results: [] }
                }

                return {
                  results: [{
                    id: 'profile_deleted',
                    userId: TEST_USER.id,
                    userTimezone: 'America/Sao_Paulo',
                    dailyCalorieGoal: 2000,
                    dailyProteinGoal: 120,
                    dailyCarbsGoal: 200,
                    dailyFatGoal: 70,
                    deletedAt: Date.now(),
                  }],
                }
              }

              if (normalized.startsWith('update user_profiles')) {
                return {
                  results: hasDeletedFilter(sql)
                    ? []
                    : [{
                      id: 'profile_deleted',
                      userId: TEST_USER.id,
                      userTimezone: 'America/Sao_Paulo',
                      deletedAt: Date.now(),
                    }],
                }
              }

              if (normalized.includes('from daily_summaries')) {
                return { results: [] }
              }

              if (normalized.includes('from meals')) {
                return { results: [] }
              }

              return { results: [] }
            },

            async raw() {
              if (normalized.includes('from user_profiles')) {
                if (hasDeletedFilter(sql)) {
                  return []
                }

                return [deletedProfileRow]
              }

              if (normalized.startsWith('update user_profiles')) {
                return hasDeletedFilter(sql) ? [] : [deletedProfileRow]
              }

              return []
            },

            async run() {
              return { success: true, meta: { changes: 0 } }
            },
          }
        },
      }
    },
  } as unknown as D1Database

  return { db, logs }
}

function createDashboardSummaryDb() {
  const mealRow = [
    'meal_1',
    TEST_USER.id,
    null,
    'lunch',
    'Frango e arroz',
    620,
    42,
    58,
    18,
    null,
    null,
    1,
    '2026-03-06',
    '2026-03-06T12:00:00.000Z',
    Date.now(),
    null,
  ]

  const db = {
    prepare(sql: string) {
      return {
        bind() {
          const normalized = normalizeSql(sql)

          return {
            async first() {
              if (normalized.includes('coalesce(sum(calories), 0) as totalcalories')) {
                return {
                  totalCalories: 620,
                  totalProtein: 42,
                  totalCarbs: 58,
                  totalFat: 18,
                  mealsCount: 1,
                }
              }
              return null
            },

            async all() {
              return { results: [] }
            },

            async raw() {
              if (normalized.includes('from user_profiles')) {
                return []
              }

              if (normalized.includes('from meals')) {
                return [mealRow]
              }

              return []
            },

            async run() {
              return { success: true, meta: { changes: 0 } }
            },
          }
        },
      }
    },
  } as unknown as D1Database

  return db
}

function createEnv(db: D1Database): Env {
  return {
    DB: db,
    GEMINI_API_KEY: 'test',
    BETTER_AUTH_SECRET: 'test-secret-123456',
    BETTER_AUTH_URL: 'http://localhost:8799',
    ENVIRONMENT: 'test',
  }
}

function createApp(env: Env) {
  const app = new Hono<{ Bindings: Env }>()
  app.route('/api/users', userRoutes)
  return { app, env }
}

describe('userRoutes soft-delete safety', () => {
  it('ignora profile soft-deletado em /me', async () => {
    const { db, logs } = createMockDb()
    const { app, env } = createApp(createEnv(db))

    const response = await app.fetch(new Request('http://localhost/api/users/me'), env, {} as ExecutionContext)
    const body = await response.json() as {
      profile: unknown
      hasCompletedOnboarding: boolean
    }

    expect(response.status).toBe(200)
    expect(body.profile).toBeNull()
    expect(body.hasCompletedOnboarding).toBe(false)
    expect(logs.some((entry) => normalizeSql(entry.sql).includes('from user_profiles') && hasDeletedFilter(entry.sql))).toBe(true)
  })

  it('exige timezone ativo em /dashboard quando só existe profile soft-deletado', async () => {
    const { db, logs } = createMockDb()
    const { app, env } = createApp(createEnv(db))

    const response = await app.fetch(new Request('http://localhost/api/users/dashboard'), env, {} as ExecutionContext)
    const body = await response.json() as {
      code?: string
    }

    expect(response.status).toBe(428)
    expect(body.code).toBe('TIMEZONE_REQUIRED')
    expect(logs.some((entry) => normalizeSql(entry.sql).includes('from user_profiles') && hasDeletedFilter(entry.sql))).toBe(true)
  })

  it('recusa PATCH /timezone quando só existe profile soft-deletado', async () => {
    const { db, logs } = createMockDb()
    const { app, env } = createApp(createEnv(db))

    const response = await app.fetch(new Request('http://localhost/api/users/timezone', {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ timezone: 'America/Sao_Paulo' }),
    }), env, {} as ExecutionContext)
    const body = await response.json() as {
      code?: string
    }

    expect(response.status).toBe(409)
    expect(body.code).toBe('ONBOARDING_REQUIRED')
    expect(logs.some((entry) => normalizeSql(entry.sql).startsWith('update user_profiles') && hasDeletedFilter(entry.sql))).toBe(true)
  })

  it('deriva summary do dashboard a partir de meals quando daily_summaries está ausente', async () => {
    const db = createDashboardSummaryDb()
    const { app, env } = createApp(createEnv(db))

    const response = await app.fetch(new Request('http://localhost/api/users/dashboard?date=2026-03-06'), env, {} as ExecutionContext)
    const body = await response.json() as {
      summary: {
        totalCalories: number
        totalProtein: number
        totalCarbs: number
        totalFat: number
        mealsCount: number
      }
      meals: Array<{ id: string }>
    }

    expect(response.status).toBe(200)
    expect(body.summary).toEqual({
      totalCalories: 620,
      totalProtein: 42,
      totalCarbs: 58,
      totalFat: 18,
      mealsCount: 1,
    })
    expect(body.meals).toHaveLength(1)
  })
})
