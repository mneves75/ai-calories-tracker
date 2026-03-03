import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { logger } from 'hono/logger'
import { authRoutes } from './routes/auth'
import { mealRoutes } from './routes/meals'
import { userRoutes } from './routes/users'
import { getMediaGcStatus, runMediaGcCycle } from './services/media-gc'
import type { Env } from './types'

const app = new Hono<{ Bindings: Env }>()

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
  let gcStatus = { pending: 0, failed: 0 }
  try {
    gcStatus = await getMediaGcStatus(c.env.DB)
  } catch {
    // Keep health endpoint available during migration rollout window.
  }
  return c.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    mediaGc: gcStatus,
  })
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
      try {
        await runMediaGcCycle(env)
      } catch (error) {
        console.error('Falha no ciclo de GC de mídia', error)
      }
    })())
  },
}
