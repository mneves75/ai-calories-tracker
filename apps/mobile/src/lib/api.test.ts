import { describe, expect, it } from 'bun:test'
import { ApiError, createMealFromAnalysis, isSessionInvalidApiError, mapApiErrorMessage, resolveApiBaseUrl } from './api'

describe('api error mapping', () => {
  it('prioriza mensagem validada do backend', () => {
    const message = mapApiErrorMessage(422, {
      details: [{ campo: 'email', mensagem: 'Email inválido.' }],
    })

    expect(message).toBe('Email inválido.')
  })

  it('traduz mensagens comuns em inglês para pt-BR', () => {
    const message = mapApiErrorMessage(401, {
      error: 'Invalid credentials',
    })

    expect(message).toBe('Email ou senha inválidos.')
  })

  it('mapeia fallback de sessão expirada', () => {
    const message = mapApiErrorMessage(401, null)
    expect(message).toBe('Sua sessão expirou. Faça login novamente.')
  })

  it('não repassa mensagem técnica crua para o usuário', () => {
    const message = mapApiErrorMessage(400, {
      error: 'Unexpected internal assertion failed',
    })

    expect(message).toBe('Erro inesperado. Tente novamente.')
  })

  it('ignora details técnicos e usa fallback seguro', () => {
    const message = mapApiErrorMessage(422, {
      details: [{ campo: 'imagem', mensagem: 'TypeError: stack trace {internal}' }],
    })

    expect(message).toBe('Dados inválidos. Revise os campos.')
  })

  it('traduz erros de idempotência para mensagem segura', () => {
    const message = mapApiErrorMessage(409, {
      code: 'IDEMPOTENCY_KEY_IN_PROGRESS',
      error: 'Idempotent request still in progress',
    })

    expect(message).toBe('Não foi possível concluir o salvamento agora. Tente novamente em alguns segundos.')
  })
})

describe('session invalid detection', () => {
  it('detecta ApiError 401 como sessão inválida', () => {
    expect(isSessionInvalidApiError(new ApiError('Sessão inválida', 401))).toBe(true)
  })

  it('detecta 403 com código explícito de sessão inválida', () => {
    expect(
      isSessionInvalidApiError(
        new ApiError('Token expirado', 403, { code: 'SESSION_EXPIRED' })
      )
    ).toBe(true)
  })

  it('não marca outros erros como sessão inválida', () => {
    expect(isSessionInvalidApiError(new ApiError('Dados inválidos', 422))).toBe(false)
    expect(isSessionInvalidApiError(new ApiError('Sem permissão', 403, { code: 'FORBIDDEN' }))).toBe(false)
    expect(isSessionInvalidApiError(new Error('falha genérica'))).toBe(false)
  })
})

describe('api base url resolution', () => {
  it('permite HTTP apenas para hosts locais', () => {
    expect(resolveApiBaseUrl('http://127.0.0.1:8799', 'ios')).toBe('http://127.0.0.1:8799/')
    expect(resolveApiBaseUrl('http://10.0.2.2:8799', 'android')).toBe('http://10.0.2.2:8799/')
  })

  it('bloqueia HTTP fora de ambiente local', () => {
    expect(() => resolveApiBaseUrl('http://api.exemplo.com', 'ios')).toThrow(
      'EXPO_PUBLIC_API_BASE_URL deve usar HTTPS fora de ambiente local'
    )
  })
})

describe('meal write transport', () => {
  it('envia Idempotency-Key e analysisToken no payload', async () => {
    const originalFetch = global.fetch
    let capturedHeaders: Record<string, string> | null = null
    let capturedBody: Record<string, unknown> | null = null

    global.fetch = (async (_input: RequestInfo | URL, init?: RequestInit) => {
      capturedHeaders = (init?.headers ?? {}) as Record<string, string>
      capturedBody = init?.body ? JSON.parse(String(init.body)) : null
      return new Response(JSON.stringify({ meal: { id: 'meal_1' } }), {
        status: 201,
        headers: { 'content-type': 'application/json' },
      })
    }) as typeof fetch

    try {
      await createMealFromAnalysis('token_1', {
        name: 'Arroz e frango',
        mealType: 'lunch',
        calories: 500,
        protein: 40,
        carbs: 50,
        fat: 15,
        localDate: '2026-03-03',
        imageKey: 'user_1/2026-03-03/image.jpg',
        analysisToken: 'analysis_123',
        operationId: 'op_123',
      })
    } finally {
      global.fetch = originalFetch
    }

    expect(capturedHeaders?.Authorization).toBe('Bearer token_1')
    expect(capturedHeaders?.['Idempotency-Key']).toBe('op_123')
    expect(capturedBody?.analysisToken).toBe('analysis_123')
  })

  it('preserva corpo problem+json em ApiError para mapear códigos fail-closed', async () => {
    const originalFetch = global.fetch

    global.fetch = (async (_input: RequestInfo | URL, _init?: RequestInit) => {
      return new Response(
        JSON.stringify({
          type: 'https://datatracker.ietf.org/doc/html/draft-ietf-httpapi-idempotency-key-header',
          title: 'Idempotent request still in progress',
          status: 409,
          detail: 'Requisição idempotente em processamento. Tente novamente em instantes.',
          code: 'IDEMPOTENCY_KEY_IN_PROGRESS',
          error: 'Idempotent request still in progress',
        }),
        {
          status: 409,
          headers: { 'content-type': 'application/problem+json' },
        }
      )
    }) as typeof fetch

    try {
      await expect(
        createMealFromAnalysis('token_1', {
          name: 'Arroz e frango',
          mealType: 'lunch',
          calories: 500,
          protein: 40,
          carbs: 50,
          fat: 15,
          localDate: '2026-03-03',
          operationId: 'op_problem_json_1',
        })
      ).rejects.toMatchObject({
        status: 409,
        body: { code: 'IDEMPOTENCY_KEY_IN_PROGRESS' },
      })
    } finally {
      global.fetch = originalFetch
    }
  })

  it('mapeia AbortError para timeout amigável', async () => {
    const originalFetch = global.fetch

    global.fetch = (async () => {
      throw Object.assign(new Error('aborted'), { name: 'AbortError' })
    }) as typeof fetch

    try {
      await expect(
        createMealFromAnalysis('token_1', {
          name: 'Arroz e frango',
          mealType: 'lunch',
          calories: 500,
          protein: 40,
          carbs: 50,
          fat: 15,
          localDate: '2026-03-03',
          operationId: 'op_abort_1',
        })
      ).rejects.toMatchObject({
        status: 0,
        message: 'Tempo limite de conexão atingido. Tente novamente.',
      })
    } finally {
      global.fetch = originalFetch
    }
  })
})
