import { describe, expect, it } from 'bun:test'
import app from './index'
import type { Env } from './types'

function createEnv(): Env {
  const db = {
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
    DB: db,
    R2: {} as R2Bucket,
    GEMINI_API_KEY: 'test',
    BETTER_AUTH_SECRET: 'test-secret-123456',
    BETTER_AUTH_URL: 'http://localhost:8799',
    ENVIRONMENT: 'test',
  }
}

describe('api app', () => {
  it('retorna 200 em /health', async () => {
    const response = await app.fetch(new Request('http://localhost/health'), createEnv(), {} as ExecutionContext)
    const body = await response.json() as { status: string; timestamp: string }

    expect(response.status).toBe(200)
    expect(body.status).toBe('ok')
    expect(typeof body.timestamp).toBe('string')
    expect(response.headers.get('x-content-type-options')).toBe('nosniff')
    expect(response.headers.get('x-frame-options')).toBe('DENY')
    expect(response.headers.get('referrer-policy')).toBe('no-referrer')
  })

  it('retorna 404 com mensagem em pt-BR para rota inexistente', async () => {
    const response = await app.fetch(new Request('http://localhost/rota-inexistente'), createEnv(), {} as ExecutionContext)
    const body = await response.json() as { error: string }

    expect(response.status).toBe(404)
    expect(body.error).toBe('Rota não encontrada')
  })
})
