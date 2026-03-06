import { describe, expect, it } from 'bun:test'
import app from './index'
import type { Env } from './types'

type IdempotencyStatus = {
  inProgress: number
  staleInProgress: number
  completedNotExpired: number
  expired: number
}

function createEnv(db?: D1Database, overrides: Partial<Env> = {}): Env {
  const defaultDb = {
    prepare() {
      return {
        bind() {
          return {
            async first() {
              return { count: 0 }
            },
          }
        },
        async first() {
          return { count: 0 }
        },
      }
    },
  } as unknown as D1Database

  return {
    DB: db ?? defaultDb,
    R2: {} as R2Bucket,
    GEMINI_API_KEY: 'test',
    BETTER_AUTH_SECRET: 'test-secret-123456',
    BETTER_AUTH_URL: 'http://localhost:8799',
    ENVIRONMENT: 'test',
    ...overrides,
  }
}

function createExecutionContext() {
  const pending: Promise<unknown>[] = []
  return {
    ctx: {
      waitUntil(promise: Promise<unknown>) {
        pending.push(promise)
      },
    } as unknown as ExecutionContext,
    async flush() {
      await Promise.all(pending)
    },
  }
}

function createScheduledDb(options: {
  failIdempotency?: boolean
  idempotencyStatus?: IdempotencyStatus
} = {}) {
  const stats = { mediaQueries: 0 }
  const idempotencyStatus = options.idempotencyStatus ?? {
    inProgress: 0,
    staleInProgress: 0,
    completedNotExpired: 0,
    expired: 0,
  }

  const db = {
    prepare(sql: string) {
      const normalizedSql = sql.toLowerCase()

      if (options.failIdempotency && normalizedSql.includes('meal_idempotency_keys')) {
        throw new Error('idempotency query failure')
      }

      if (normalizedSql.includes('from media_objects')) {
        stats.mediaQueries += 1
      }

      const response = {
        async first() {
          if (normalizedSql.includes('from media_objects') && normalizedSql.includes('count(*) as count')) {
            return { count: 0 }
          }
          if (normalizedSql.includes('from meal_idempotency_keys')) {
            return idempotencyStatus
          }
          return { count: 0 }
        },
        async all() {
          return { results: [] }
        },
        async run() {
          return { meta: { changes: 0 } }
        },
      }

      return {
        bind() {
          return response
        },
        first: response.first,
      }
    },
  } as unknown as D1Database

  return { db, stats }
}

async function captureConsoleErrors(run: () => Promise<void> | void) {
  const originalError = console.error
  const calls: unknown[][] = []
  console.error = (...args: unknown[]) => {
    calls.push(args)
  }

  try {
    await run()
  } finally {
    console.error = originalError
  }

  return calls
}

describe('api app', () => {
  it('retorna 200 em /health', async () => {
    const response = await app.fetch(new Request('http://localhost/health'), createEnv(), {} as ExecutionContext)
    const body = await response.json() as {
      status: string
      timestamp: string
      checks: { mediaGc: 'ok' | 'error'; idempotency: 'ok' | 'error' }
      idempotency: { inProgress: number; staleInProgress: number; completedNotExpired: number; expired: number }
    }

    expect(response.status).toBe(200)
    expect(body.status).toBe('ok')
    expect(body.checks.mediaGc).toBe('ok')
    expect(body.checks.idempotency).toBe('ok')
    expect(typeof body.timestamp).toBe('string')
    expect(body.idempotency.inProgress).toBe(0)
    expect(response.headers.get('x-content-type-options')).toBe('nosniff')
    expect(response.headers.get('x-frame-options')).toBe('DENY')
    expect(response.headers.get('referrer-policy')).toBe('no-referrer')
    expect(response.headers.get('permissions-policy')).toBe('camera=(), microphone=(), geolocation=()')
    expect(response.headers.get('cross-origin-opener-policy')).toBe('same-origin')
    expect(response.headers.get('cross-origin-resource-policy')).toBe('same-origin')
    expect(response.headers.get('content-security-policy')).toBe("default-src 'none'; frame-ancestors 'none'")
  })

  it('retorna 503 em /health quando verificações internas falham', async () => {
    const failingDb = {
      prepare() {
        throw new Error('db unavailable')
      },
    } as unknown as D1Database

    const logs = await captureConsoleErrors(async () => {
      const response = await app.fetch(new Request('http://localhost/health'), createEnv(failingDb), {} as ExecutionContext)
      const body = await response.json() as {
        status: string
        checks: { mediaGc: 'ok' | 'error'; idempotency: 'ok' | 'error' }
      }

      expect(response.status).toBe(503)
      expect(body.status).toBe('degraded')
      expect(body.checks.mediaGc).toBe('error')
      expect(body.checks.idempotency).toBe('error')
    })

    expect(logs.some((entry) => entry[0] === 'HEALTH_CHECK_FAILED')).toBe(true)
  })

  it('scheduled mantém media GC ativo quando idempotência falha', async () => {
    const { db, stats } = createScheduledDb({ failIdempotency: true })
    const env = createEnv(db)
    const { ctx, flush } = createExecutionContext()

    const logs = await captureConsoleErrors(async () => {
      await app.scheduled({} as ScheduledEvent, env, ctx)
      await flush()
    })

    expect(stats.mediaQueries).toBeGreaterThan(0)
    expect(logs.some((entry) => entry[0] === 'MAINTENANCE_TASK_FAILED' && (entry[1] as { task?: string }).task === 'idempotency')).toBe(true)
    expect(logs.some((entry) => entry[0] === 'MAINTENANCE_CYCLE_PARTIAL_FAILURE')).toBe(true)
  })

  it('scheduled emite IDEMPOTENCY_ALERT para status crítico', async () => {
    const { db } = createScheduledDb({
      idempotencyStatus: {
        inProgress: 25,
        staleInProgress: 1,
        completedNotExpired: 3,
        expired: 2,
      },
    })
    const env = createEnv(db)
    const { ctx, flush } = createExecutionContext()

    const logs = await captureConsoleErrors(async () => {
      await app.scheduled({} as ScheduledEvent, env, ctx)
      await flush()
    })

    const alertEntry = logs.find((entry) => entry[0] === 'IDEMPOTENCY_ALERT')
    expect(alertEntry).toBeDefined()
    expect((alertEntry?.[1] as { staleInProgress?: number }).staleInProgress).toBe(1)
  })

  it('scheduled aplica fallback seguro para envs inválidas', async () => {
    const { db } = createScheduledDb()
    const env = createEnv(db, {
      IDEMPOTENCY_IN_PROGRESS_ALERT_THRESHOLD: '-2',
      IDEMPOTENCY_IN_PROGRESS_STALE_MS: 'abc',
    })
    const { ctx, flush } = createExecutionContext()

    const logs = await captureConsoleErrors(async () => {
      await app.scheduled({} as ScheduledEvent, env, ctx)
      await flush()
    })

    const invalidEnvLogs = logs.filter((entry) => entry[0] === 'INVALID_ENV_VALUE')
    expect(invalidEnvLogs.length).toBe(2)
  })

  it('retorna 404 com mensagem em pt-BR para rota inexistente', async () => {
    const response = await app.fetch(new Request('http://localhost/rota-inexistente'), createEnv(), {} as ExecutionContext)
    const body = await response.json() as { error: string }

    expect(response.status).toBe(404)
    expect(body.error).toBe('Rota não encontrada')
    expect(response.headers.get('x-content-type-options')).toBe('nosniff')
    expect(response.headers.get('content-security-policy')).toBe("default-src 'none'; frame-ancestors 'none'")
  })

  it('envia HSTS em produção', async () => {
    const response = await app.fetch(
      new Request('http://localhost/health'),
      createEnv(undefined, { ENVIRONMENT: 'production' }),
      {} as ExecutionContext
    )

    expect(response.status).toBe(200)
    expect(response.headers.get('strict-transport-security')).toBe('max-age=31536000; includeSubDomains')
  })
})
