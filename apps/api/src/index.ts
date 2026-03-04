import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { logger } from 'hono/logger'
import { authRoutes } from './routes/auth'
import { mealRoutes } from './routes/meals'
import { userRoutes } from './routes/users'
import { getMediaGcStatus, runMediaGcCycle } from './services/media-gc'
import { getIdempotencyHealthStatus, purgeExpiredMealIdempotencyKeys } from './services/idempotency-gc'
import type { Env } from './types'

const app = new Hono<{ Bindings: Env }>()
const DEFAULT_MEDIA_GC_STATUS = { pending: 0, failed: 0 }
const DEFAULT_IDEMPOTENCY_STATUS = {
  inProgress: 0,
  staleInProgress: 0,
  completedNotExpired: 0,
  expired: 0,
}
const DEFAULT_IDEMPOTENCY_STALE_MS = 2 * 60 * 1000
const DEFAULT_IDEMPOTENCY_ALERT_THRESHOLD = 25

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error)
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

function parsePositiveIntEnv(name: string, value: string | undefined, fallback: number) {
  if (value == null) {
    return fallback
  }

  const parsed = Number(value)
  if (!Number.isFinite(parsed) || parsed < 1) {
    console.error('INVALID_ENV_VALUE', { name, value, fallback })
    return fallback
  }

  return Math.floor(parsed)
}

// Global middleware
app.use('*', logger())
app.use('*', async (c, next) => {
  c.res.headers.set('X-Content-Type-Options', 'nosniff')
  c.res.headers.set('Referrer-Policy', 'no-referrer')
  c.res.headers.set('X-Frame-Options', 'DENY')
  c.res.headers.set('Permissions-Policy', 'camera=(), microphone=(), geolocation=()')
  c.res.headers.set('Cross-Origin-Opener-Policy', 'same-origin')
  c.res.headers.set('Cross-Origin-Resource-Policy', 'same-origin')
  c.res.headers.set('Content-Security-Policy', "default-src 'none'; frame-ancestors 'none'")

  if (c.env.ENVIRONMENT === 'production') {
    c.res.headers.set('Strict-Transport-Security', 'max-age=31536000; includeSubDomains')
  }

  await next()
})
app.use('*', cors({
  origin: ['http://localhost:8081', 'aicaloriestracker://'],
  credentials: true,
}))

// Health check
app.get('/health', async (c) => {
  let status: 'ok' | 'degraded' = 'ok'
  const checks = {
    mediaGc: 'ok' as 'ok' | 'error',
    idempotency: 'ok' as 'ok' | 'error',
  }
  let gcStatus = DEFAULT_MEDIA_GC_STATUS
  let idempotency = DEFAULT_IDEMPOTENCY_STATUS

  try {
    gcStatus = await getMediaGcStatus(c.env.DB)
  } catch (error) {
    status = 'degraded'
    checks.mediaGc = 'error'
    console.error('HEALTH_CHECK_FAILED', { check: 'mediaGc', error: errorMessage(error) })
  }

  try {
    idempotency = await getIdempotencyHealthStatus(c.env.DB)
  } catch (error) {
    status = 'degraded'
    checks.idempotency = 'error'
    console.error('HEALTH_CHECK_FAILED', { check: 'idempotency', error: errorMessage(error) })
  }

  return c.json({
    status,
    timestamp: new Date().toISOString(),
    checks,
    mediaGc: gcStatus,
    idempotency,
  }, status === 'ok' ? 200 : 503)
})

// Mount routes
app.route('/api', authRoutes)
app.route('/api/meals', mealRoutes)
app.route('/api/users', userRoutes)

// 404 handler
app.notFound((c) => c.json({ error: 'Rota não encontrada' }, 404))

// Error handler
app.onError((err, c) => {
  const requestId = crypto.randomUUID()
  const message = err instanceof Error ? err.message : 'Erro desconhecido'

  console.error('Erro não tratado', {
    requestId,
    method: c.req.method,
    path: c.req.path,
    message,
  })

  return c.json({ error: 'Erro interno do servidor', requestId }, 500)
})

export default {
  fetch: app.fetch,
  scheduled: async (_event: ScheduledEvent, env: Env, ctx: ExecutionContext) => {
    ctx.waitUntil((async () => {
      let idempotencyMaintOk = false
      let mediaGcOk = false

      const staleInProgressMs = parsePositiveIntEnv(
        'IDEMPOTENCY_IN_PROGRESS_STALE_MS',
        env.IDEMPOTENCY_IN_PROGRESS_STALE_MS,
        DEFAULT_IDEMPOTENCY_STALE_MS
      )
      const inProgressAlertThreshold = parseNonNegativeIntEnv(
        'IDEMPOTENCY_IN_PROGRESS_ALERT_THRESHOLD',
        env.IDEMPOTENCY_IN_PROGRESS_ALERT_THRESHOLD,
        DEFAULT_IDEMPOTENCY_ALERT_THRESHOLD
      )

      try {
        const removed = await purgeExpiredMealIdempotencyKeys(env.DB)
        const status = await getIdempotencyHealthStatus(
          env.DB,
          Date.now(),
          staleInProgressMs
        )
        idempotencyMaintOk = true
        const shouldAlert = (
          status.staleInProgress > 0
          || status.inProgress >= inProgressAlertThreshold
        )

        if (shouldAlert) {
          console.error('IDEMPOTENCY_ALERT', {
            removedExpired: removed,
            inProgress: status.inProgress,
            staleInProgress: status.staleInProgress,
            completedNotExpired: status.completedNotExpired,
            expired: status.expired,
            inProgressAlertThreshold,
          })
        }
      } catch (error) {
        console.error('MAINTENANCE_TASK_FAILED', {
          task: 'idempotency',
          error: errorMessage(error),
        })
      }

      try {
        await runMediaGcCycle(env)
        mediaGcOk = true
      } catch (error) {
        console.error('MAINTENANCE_TASK_FAILED', {
          task: 'mediaGc',
          error: errorMessage(error),
        })
      }

      if (!idempotencyMaintOk || !mediaGcOk) {
        console.error('MAINTENANCE_CYCLE_PARTIAL_FAILURE', {
          idempotencyMaintOk,
          mediaGcOk,
        })
      }
    })())
  },
}
