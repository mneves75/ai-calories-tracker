import { describe, expect, it } from 'bun:test'
import { Hono } from 'hono'
import { rateLimitAnalysis } from './rate-limit'
import type { Env } from '../types'

function createEnvWithCount(count: number, onBind?: (params: unknown[]) => void): Env {
  const db = {
    prepare() {
      return {
        bind(...params: unknown[]) {
          onBind?.(params)
          return {
            async first<T>() {
              return { count } as T
            },
          }
        },
      }
    },
  } as unknown as D1Database

  return {
    DB: db,
    R2: {} as R2Bucket,
    GEMINI_API_KEY: 'test',
    BETTER_AUTH_SECRET: 'test',
    BETTER_AUTH_URL: 'http://localhost:8799',
    ENVIRONMENT: 'test',
  }
}

function createApp() {
  const app = new Hono<{
    Bindings: Env
    Variables: {
      user: { id: string; email: string; name: string }
    }
  }>()

  app.use('*', async (c, next) => {
    c.set('user', { id: 'user_1', email: 'user@example.com', name: 'User' })
    await next()
  })
  app.use('*', rateLimitAnalysis)
  app.post('/analyze', (c) => c.json({ ok: true }))

  return app
}

describe('rateLimitAnalysis', () => {
  it('ignora localDate do cliente e usa data do servidor na contagem', async () => {
    const app = createApp()
    const serverDate = new Date().toISOString().slice(0, 10)
    let boundDate = ''

    const response = await app.request(
      'http://localhost/analyze',
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          imageBase64: 'a'.repeat(220),
          mealType: 'lunch',
          localDate: '1999-01-01',
        }),
      },
      createEnvWithCount(0, (params) => {
        boundDate = String(params[1])
      })
    )

    expect(response.status).toBe(200)
    expect(boundDate).toBe(serverDate)
  })

  it('permite requisição abaixo do limite diário', async () => {
    const app = createApp()
    const response = await app.request(
      'http://localhost/analyze',
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          imageBase64: 'a'.repeat(220),
          mealType: 'lunch',
          localDate: '2026-03-03',
        }),
      },
      createEnvWithCount(49)
    )

    expect(response.status).toBe(200)
  })

  it('bloqueia com 429 ao atingir 50 análises no dia', async () => {
    const app = createApp()
    const response = await app.request(
      'http://localhost/analyze',
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          imageBase64: 'a'.repeat(220),
          mealType: 'lunch',
          localDate: '2026-03-03',
        }),
      },
      createEnvWithCount(50)
    )

    const body = await response.json() as { error: string; limite: number }
    expect(response.status).toBe(429)
    expect(body.error).toBe('Limite de análises atingido')
    expect(body.limite).toBe(50)
  })
})
