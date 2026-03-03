import { describe, expect, it } from 'bun:test'
import type { Env } from '../types'
import { runMediaGcCycle } from './media-gc'

type MediaStatus = 'uploaded' | 'attached' | 'pending_delete' | 'delete_failed' | 'deleted'

type MediaRow = {
  id: string
  userId: string
  imageKey: string
  mealId: string | null
  status: MediaStatus
  deleteAfter: number | null
  deletedAt: number | null
  attemptCount: number
  lastError: string | null
  updatedAt: number
}

function createMockEnv(input: {
  mediaRows: MediaRow[]
  activeMeals?: Record<string, string>
  withR2?: boolean
  threshold?: string
}) {
  const mediaRows = [...input.mediaRows]
  const activeMeals = input.activeMeals ?? {}
  let deleteCalls = 0

  const db = {
    prepare(sql: string) {
      const execute = (...params: unknown[]) => {
        const normalized = sql.toLowerCase()
        return {
          normalized,
          params,
        }
      }

      return {
        async first<T>() {
          const query = execute()
          const normalized = query.normalized
          const params: unknown[] = query.params

          if (normalized.includes('from media_objects') && normalized.includes('count(*) as count')) {
            if (normalized.includes("status = 'delete_failed'")) {
              const failed = mediaRows.filter((row) => row.deletedAt === null && row.status === 'delete_failed').length
              return { count: failed } as T
            }

            const now = Number(params[0] ?? Date.now())
            const pending = mediaRows.filter((row) => row.deletedAt === null).filter((row) => (
              row.status === 'pending_delete'
              || row.status === 'delete_failed'
              || (row.status === 'uploaded' && row.deleteAfter !== null && row.deleteAfter <= now)
            )).length

            return { count: pending } as T
          }

          return null as T
        },
        bind(...params: unknown[]) {
          const normalized = sql.toLowerCase()
          return {
            async all<T>() {
              if (normalized.includes('from media_objects') && normalized.includes('order by updated_at')) {
                const now = Number(params[0])
                const limit = Number(params[1])
                const results = mediaRows
                  .filter((row) => row.deletedAt === null)
                  .filter((row) => (
                    row.status === 'pending_delete'
                    || row.status === 'delete_failed'
                    || (row.status === 'uploaded' && row.deleteAfter !== null && row.deleteAfter <= now)
                  ))
                  .sort((a, b) => a.updatedAt - b.updatedAt)
                  .slice(0, limit)
                  .map((row) => ({
                    id: row.id,
                    userId: row.userId,
                    imageKey: row.imageKey,
                    mealId: row.mealId,
                    status: row.status,
                    deleteAfter: row.deleteAfter,
                    attemptCount: row.attemptCount,
                  }))

                return { results: results as T[] }
              }

              return { results: [] as T[] }
            },
            async first<T>() {
              if (normalized.includes('from meals')) {
                const key = String(params[1])
                const mealId = activeMeals[key]
                if (!mealId) {
                  return null as T
                }
                return { id: mealId } as T
              }

              if (normalized.includes('from media_objects') && normalized.includes('count(*) as count')) {
                if (normalized.includes("status = 'delete_failed'")) {
                  const failed = mediaRows.filter((row) => row.deletedAt === null && row.status === 'delete_failed').length
                  return { count: failed } as T
                }

                const now = Number(params[0])
                const pending = mediaRows.filter((row) => row.deletedAt === null).filter((row) => (
                  row.status === 'pending_delete'
                  || row.status === 'delete_failed'
                  || (row.status === 'uploaded' && row.deleteAfter !== null && row.deleteAfter <= now)
                )).length

                return { count: pending } as T
              }

              return null as T
            },
            async run() {
              if (normalized.includes("set status = 'attached'")) {
                const id = String(params[params.length - 1])
                const row = mediaRows.find((item) => item.id === id)
                if (row) {
                  row.status = 'attached'
                  row.deleteAfter = null
                  row.updatedAt = Number(params[1] ?? Date.now())
                }
                return { success: true, meta: { changes: row ? 1 : 0 } }
              }

              if (normalized.includes("status = 'deleted'")) {
                const id = String(params[2])
                const row = mediaRows.find((item) => item.id === id)
                if (row) {
                  row.status = 'deleted'
                  row.deletedAt = Number(params[0])
                  row.updatedAt = Number(params[1])
                }
                return { success: true, meta: { changes: row ? 1 : 0 } }
              }

              if (normalized.includes("status = 'delete_failed'")) {
                const id = String(params[2])
                const row = mediaRows.find((item) => item.id === id)
                if (row) {
                  row.status = 'delete_failed'
                  row.attemptCount += 1
                  row.lastError = String(params[0])
                  row.updatedAt = Number(params[1])
                }
                return { success: true, meta: { changes: row ? 1 : 0 } }
              }

              return { success: true, meta: { changes: 1 } }
            },
          }
        },
      }
    },
  } as unknown as D1Database

  const env: Env = {
    DB: db,
    R2: input.withR2 === false ? undefined : {
      async delete() {
        deleteCalls += 1
      },
    } as unknown as R2Bucket,
    GEMINI_API_KEY: 'test',
    BETTER_AUTH_SECRET: 'test-secret-123456',
    BETTER_AUTH_URL: 'http://localhost:8799',
    ENVIRONMENT: 'test',
    MEDIA_GC_ALERT_THRESHOLD: input.threshold,
  }

  return {
    env,
    mediaRows,
    getDeleteCalls: () => deleteCalls,
  }
}

describe('media GC', () => {
  it('remove órfão expirado e marca como deleted', async () => {
    const state = createMockEnv({
      mediaRows: [{
        id: 'media_1',
        userId: 'user_1',
        imageKey: 'user_1/2026-03-03/a.jpg',
        mealId: null,
        status: 'uploaded',
        deleteAfter: 1,
        deletedAt: null,
        attemptCount: 0,
        lastError: null,
        updatedAt: 1,
      }],
      withR2: true,
      threshold: '100',
    })

    const metrics = await runMediaGcCycle(state.env, { now: 10, batchSize: 10 })

    expect(metrics.deleted).toBe(1)
    expect(metrics.orphanDeleted).toBe(1)
    expect(metrics.failed).toBe(0)
    expect(metrics.alert).toBe(false)
    expect(state.getDeleteCalls()).toBe(1)
    expect(state.mediaRows[0]?.status).toBe('deleted')
  })

  it('marca falha e alerta quando R2 não está disponível', async () => {
    const state = createMockEnv({
      mediaRows: [{
        id: 'media_2',
        userId: 'user_1',
        imageKey: 'user_1/2026-03-03/b.jpg',
        mealId: null,
        status: 'pending_delete',
        deleteAfter: 1,
        deletedAt: null,
        attemptCount: 0,
        lastError: null,
        updatedAt: 1,
      }],
      withR2: false,
      threshold: '1',
    })

    const metrics = await runMediaGcCycle(state.env, { now: 10, batchSize: 10 })

    expect(metrics.failed).toBe(1)
    expect(metrics.alert).toBe(true)
    expect(state.mediaRows[0]?.status).toBe('delete_failed')
  })
})
