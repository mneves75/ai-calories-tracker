import { describe, expect, it, mock } from 'bun:test'
import { Hono } from 'hono'
import type { Env } from '../types'

type SessionUser = { id: string; email: string; name: string }
type SessionData = {
  user: SessionUser
  session: { id: string; userId: string; token: string }
}

let mockedSession: SessionData | null = null

mock.module('../lib/auth', () => ({
  createAuth: () => ({
    api: {
      getSession: async () => mockedSession,
    },
  }),
}))

const { authMiddleware } = await import('./auth')

function createEnv() {
  return {
    DB: {} as D1Database,
    R2: {} as R2Bucket,
    GEMINI_API_KEY: 'test-key',
    BETTER_AUTH_SECRET: 'test-secret-123456',
    BETTER_AUTH_URL: 'http://localhost:8799',
    ENVIRONMENT: 'test',
  } as Env
}

function createApp() {
  const app = new Hono<{ Bindings: Env }>()
  app.use('/private/*', authMiddleware)
  app.get('/private/me', (c) => c.json({ userId: c.var.user.id }))
  return app
}

describe('authMiddleware', () => {
  it('retorna 401 quando sessão está ausente', async () => {
    mockedSession = null
    const app = createApp()

    const response = await app.request('http://localhost/private/me', { method: 'GET' }, createEnv())
    const body = await response.json() as { error: string }

    expect(response.status).toBe(401)
    expect(body.error).toBe('Não autorizado')
  })

  it('injeta user/session quando sessão é válida', async () => {
    mockedSession = {
      user: { id: 'user_1', email: 'user@example.com', name: 'User' },
      session: { id: 'session_1', userId: 'user_1', token: 'token_1' },
    }
    const app = createApp()

    const response = await app.request('http://localhost/private/me', { method: 'GET' }, createEnv())
    const body = await response.json() as { userId: string }

    expect(response.status).toBe(200)
    expect(body.userId).toBe('user_1')
  })
})
