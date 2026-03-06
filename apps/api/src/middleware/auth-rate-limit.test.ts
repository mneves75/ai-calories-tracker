import { describe, expect, it } from 'bun:test'
import { Hono } from 'hono'
import type { Env } from '../types'
import { authRateLimit } from './auth-rate-limit'

type QueryLog = {
  sql: string
  params: unknown[]
}

function createEnv(initialAttempts = 0, environment: Env['ENVIRONMENT'] = 'test') {
  const counters = new Map<string, number>()
  const logs: QueryLog[] = []

  const db = {
    prepare(sql: string) {
      return {
        bind(...params: unknown[]) {
          logs.push({ sql, params })
          const normalizedSql = sql.toLowerCase()
          return {
            async run() {
              if (normalizedSql.includes('insert into auth_rate_limits')) {
                const key = String(params[1] ?? '')
                const windowStart = String(params[2] ?? '')
                const counterKey = `${key}:${windowStart}`
                const current = counters.get(counterKey) ?? initialAttempts
                const next = current + 1
                counters.set(counterKey, next)
              }
              return { success: true, meta: { changes: 1 } }
            },
            async first<T>() {
              if (normalizedSql.includes('select attempts')) {
                const key = String(params[0] ?? '')
                const windowStart = String(params[1] ?? '')
                const counterKey = `${key}:${windowStart}`
                const attempts = counters.get(counterKey) ?? initialAttempts
                return { attempts } as T
              }
              return null as T
            },
          }
        },
      }
    },
  } as unknown as D1Database

  return {
    logs,
    env: {
      DB: db,
      R2: {} as R2Bucket,
      GEMINI_API_KEY: 'test-key',
      BETTER_AUTH_SECRET: 'test-secret-123456',
      BETTER_AUTH_URL: 'http://localhost:8799',
      ENVIRONMENT: environment,
    } as Env,
  }
}

function createApp() {
  const app = new Hono<{ Bindings: Env }>()
  app.use('/api/auth/*', authRateLimit)
  app.post('/api/auth/sign-in/email', (c) => c.json({ ok: true }))
  app.post('/api/auth/sign-up/email', (c) => c.json({ ok: true }))
  app.post('/api/auth/sign-out', (c) => c.json({ ok: true }))
  return app
}

describe('authRateLimit', () => {
  it('permite tentativas abaixo do limite', async () => {
    const app = createApp()
    const { env } = createEnv(0)
    const response = await app.request('http://localhost/api/auth/sign-in/email', {
      method: 'POST',
    }, env)

    expect(response.status).toBe(200)
  })

  it('bloqueia quando excede o limite por janela', async () => {
    const app = createApp()
    const { env } = createEnv(5)
    const response = await app.request('http://localhost/api/auth/sign-in/email', {
      method: 'POST',
      headers: { 'cf-connecting-ip': '203.0.113.10' },
    }, env)

    const body = await response.json() as { error: string; limite: number; usado: number }
    expect(response.status).toBe(429)
    expect(body.error).toBe('Muitas tentativas de autenticação')
    expect(body.limite).toBe(5)
    expect(body.usado).toBe(6)
    expect(response.headers.get('retry-after')).not.toBeNull()
  })

  it('não aplica limite em endpoints de auth fora de sign-in/sign-up', async () => {
    const app = createApp()
    const { env } = createEnv(999)
    const response = await app.request('http://localhost/api/auth/sign-out', {
      method: 'POST',
    }, env)

    expect(response.status).toBe(200)
  })

  it('aplica limiter também no sign-up com chave dedicada', async () => {
    const app = createApp()
    const state = createEnv(0, 'test')

    const response = await app.request('http://localhost/api/auth/sign-up/email', {
      method: 'POST',
      headers: {
        'x-forwarded-for': '198.51.100.44',
      },
    }, state.env)

    expect(response.status).toBe(200)
    const insertLog = state.logs.find((entry) => entry.sql.toLowerCase().includes('insert into auth_rate_limits'))
    expect(insertLog?.params[1]).toBe('signup:198.51.100.44')
  })

  it('ignora x-forwarded-for em produção quando cf-connecting-ip não existe', async () => {
    const app = createApp()
    const state = createEnv(0, 'production')

    const response = await app.request('http://localhost/api/auth/sign-in/email', {
      method: 'POST',
      headers: {
        'x-forwarded-for': '198.51.100.99',
      },
    }, state.env)

    expect(response.status).toBe(200)
    const insertLog = state.logs.find((entry) => entry.sql.toLowerCase().includes('insert into auth_rate_limits'))
    expect(insertLog?.params[1]).toBe('signin:unknown')
  })

  it('aceita x-forwarded-for em ambiente local/teste para facilitar smoke local', async () => {
    const app = createApp()
    const state = createEnv(0, 'test')

    const response = await app.request('http://localhost/api/auth/sign-in/email', {
      method: 'POST',
      headers: {
        'x-forwarded-for': '198.51.100.33',
      },
    }, state.env)

    expect(response.status).toBe(200)
    const insertLog = state.logs.find((entry) => entry.sql.toLowerCase().includes('insert into auth_rate_limits'))
    expect(insertLog?.params[1]).toBe('signin:198.51.100.33')
  })
})
