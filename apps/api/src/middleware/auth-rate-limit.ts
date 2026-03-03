import { createMiddleware } from 'hono/factory'
import type { Env } from '../types'

type AuthRateLimitEnv = {
  Bindings: Env
}

const AUTH_WINDOW_MS = 60_000
const AUTH_MAX_ATTEMPTS_PER_WINDOW = 5

const AUTH_ROUTE_KEYS = new Map<string, 'signin' | 'signup'>([
  ['POST:/api/auth/sign-in/email', 'signin'],
  ['POST:/api/auth/sign-up/email', 'signup'],
  ['POST:/auth/sign-in/email', 'signin'],
  ['POST:/auth/sign-up/email', 'signup'],
])

function normalizePath(path: string) {
  if (path.length > 1 && path.endsWith('/')) {
    return path.slice(0, -1)
  }
  return path
}

function resolveClientIp(headers: Headers, environment: Env['ENVIRONMENT']) {
  const cfIp = headers.get('cf-connecting-ip')?.trim()
  if (cfIp) {
    return cfIp
  }

  if (environment === 'local' || environment === 'test') {
    const forwarded = headers.get('x-forwarded-for')?.split(',')[0]?.trim()
    if (forwarded) {
      return forwarded
    }
  }

  return 'unknown'
}

function buildLimiterKey(path: string, method: string, ip: string) {
  const routeKey = AUTH_ROUTE_KEYS.get(`${method.toUpperCase()}:${normalizePath(path)}`)
  if (!routeKey) {
    return null
  }

  return `${routeKey}:${ip}`
}

function getRetryAfterSeconds(windowStart: number, now: number) {
  return Math.max(1, Math.ceil((windowStart + AUTH_WINDOW_MS - now) / 1000))
}

export const authRateLimit = createMiddleware<AuthRateLimitEnv>(async (c, next) => {
  const now = Date.now()
  const windowStart = Math.floor(now / AUTH_WINDOW_MS) * AUTH_WINDOW_MS
  const ip = resolveClientIp(c.req.raw.headers, c.env.ENVIRONMENT)
  const limiterKey = buildLimiterKey(c.req.path, c.req.method, ip)
  if (!limiterKey) {
    await next()
    return
  }

  await c.env.DB.prepare(`
    INSERT INTO auth_rate_limits (id, key, window_start, attempts, created_at, updated_at)
    VALUES (?, ?, ?, 1, ?, ?)
    ON CONFLICT(key, window_start) DO UPDATE SET
      attempts = attempts + 1,
      updated_at = excluded.updated_at
  `).bind(crypto.randomUUID(), limiterKey, windowStart, now, now).run()

  const row = await c.env.DB.prepare(`
    SELECT attempts
    FROM auth_rate_limits
    WHERE key = ? AND window_start = ?
    LIMIT 1
  `).bind(limiterKey, windowStart).first<{ attempts: number }>()
  const attempts = Number(row?.attempts ?? 0)
  if (attempts > AUTH_MAX_ATTEMPTS_PER_WINDOW) {
    return c.json({
      error: 'Muitas tentativas de autenticação',
      mensagem: 'Você fez muitas tentativas. Aguarde 1 minuto e tente novamente.',
      limite: AUTH_MAX_ATTEMPTS_PER_WINDOW,
      usado: attempts,
      janelaSegundos: AUTH_WINDOW_MS / 1000,
    }, 429, {
      'Retry-After': String(getRetryAfterSeconds(windowStart, now)),
    })
  }

  await next()
})
