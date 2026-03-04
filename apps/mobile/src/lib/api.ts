import type {
  AnalysisResponse,
  AuthUser,
  DashboardResponse,
  HistoryResponse,
  MeResponse,
  MealType,
  FoodItem,
} from '../types/domain'

type RequestOptions = {
  method?: 'GET' | 'POST' | 'DELETE'
  token?: string | null
  body?: Record<string, unknown>
  query?: Record<string, string | number | undefined>
  headers?: Record<string, string>
  timeoutMs?: number
}

export type ApiErrorBody = {
  type?: string
  title?: string
  status?: number
  detail?: string
  instance?: string
  error?: string
  message?: string
  mensagem?: string
  code?: string
  details?: Array<{ campo: string; mensagem: string }>
}

const baseFromEnv = process.env.EXPO_PUBLIC_API_BASE_URL?.trim()
let runtimePlatform: string | null = null
try {
  const platformModule = require('react-native') as { Platform?: { OS?: string } }
  runtimePlatform = platformModule.Platform?.OS ?? null
} catch {
  runtimePlatform = null
}

const DEFAULT_TIMEOUT_MS = 15_000
const LOCAL_HTTP_HOSTS = new Set(['127.0.0.1', 'localhost', '10.0.2.2'])

export function resolveApiBaseUrl(rawBase: string | null | undefined, platform: string | null) {
  const defaultBase = platform === 'android' ? 'http://10.0.2.2:8799' : 'http://127.0.0.1:8799'
  const candidate = rawBase && rawBase.length > 0 ? rawBase : defaultBase

  let parsed: URL
  try {
    parsed = new URL(candidate)
  } catch {
    throw new Error('EXPO_PUBLIC_API_BASE_URL inválida')
  }

  const isHttps = parsed.protocol === 'https:'
  const isLocalHttp = parsed.protocol === 'http:' && LOCAL_HTTP_HOSTS.has(parsed.hostname)
  if (!isHttps && !isLocalHttp) {
    throw new Error('EXPO_PUBLIC_API_BASE_URL deve usar HTTPS fora de ambiente local')
  }

  if (process.env.NODE_ENV === 'production' && !isHttps) {
    throw new Error('API deve usar HTTPS em produção')
  }

  return parsed.toString()
}

export const API_BASE_URL = resolveApiBaseUrl(baseFromEnv, runtimePlatform)

export class ApiError extends Error {
  status: number
  body: ApiErrorBody | null

  constructor(message: string, status: number, body: ApiErrorBody | null = null) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.body = body
  }
}

const SESSION_INVALID_CODES = new Set([
  'UNAUTHORIZED',
  'INVALID_TOKEN',
  'SESSION_EXPIRED',
  'SESSION_NOT_FOUND',
])

export function isSessionInvalidApiError(error: unknown) {
  if (!(error instanceof ApiError)) {
    return false
  }

  if (error.status === 401) {
    return true
  }

  if (error.status === 403) {
    const normalizedCode = error.body?.code?.trim().toUpperCase()
    return normalizedCode ? SESSION_INVALID_CODES.has(normalizedCode) : false
  }

  return false
}

function buildUrl(path: string, query?: Record<string, string | number | undefined>) {
  const url = new URL(path, API_BASE_URL)
  if (query) {
    Object.entries(query).forEach(([key, value]) => {
      if (value !== undefined && value !== null) {
        url.searchParams.set(key, String(value))
      }
    })
  }
  return url.toString()
}

function translateKnownApiError(
  rawMessage: string | null | undefined,
  code: string | null | undefined,
  status: number
) {
  const normalizedCode = code?.trim().toUpperCase()
  if (normalizedCode) {
    switch (normalizedCode) {
      case 'UNAUTHORIZED':
      case 'INVALID_TOKEN':
      case 'SESSION_EXPIRED':
      case 'SESSION_NOT_FOUND':
        return 'Sua sessão expirou. Faça login novamente.'
      case 'INVALID_CREDENTIALS':
        return 'Email ou senha inválidos.'
      case 'USER_ALREADY_EXISTS':
      case 'EMAIL_ALREADY_EXISTS':
        return 'Já existe uma conta com este email.'
      case 'RATE_LIMIT_EXCEEDED':
      case 'TOO_MANY_REQUESTS':
        return 'Muitas tentativas. Aguarde alguns segundos e tente novamente.'
      case 'TIMEZONE_REQUIRED':
      case 'TIMEZONE_INVALID':
        return 'Seu fuso horário precisa ser configurado novamente. Atualize seu perfil.'
      case 'MEDIA_TOKEN_REQUIRED':
      case 'MEDIA_TOKEN_INVALID':
      case 'MEDIA_NOT_AVAILABLE':
        return 'A imagem selecionada expirou. Faça uma nova análise para continuar.'
      case 'IDEMPOTENCY_KEY_REQUIRED':
      case 'IDEMPOTENCY_KEY_CONFLICT':
      case 'IDEMPOTENCY_KEY_IN_PROGRESS':
      case 'IDEMPOTENCY_KEY_STALE':
      case 'IDEMPOTENCY_KEY_RESERVATION_FAILED':
        return 'Não foi possível concluir o salvamento agora. Tente novamente em alguns segundos.'
      default:
        break
    }
  }

  if (!rawMessage) {
    return null
  }

  const normalizedMessage = rawMessage.trim().toLowerCase()
  if (normalizedMessage.length === 0) {
    return null
  }

  if (normalizedMessage.includes('unauthorized') || normalizedMessage.includes('not authorized')) {
    return 'Sua sessão expirou. Faça login novamente.'
  }

  if (
    normalizedMessage.includes('invalid credentials') ||
    normalizedMessage.includes('invalid email or password') ||
    normalizedMessage.includes('email or password is incorrect') ||
    normalizedMessage.includes('wrong password')
  ) {
    return 'Email ou senha inválidos.'
  }

  if (
    normalizedMessage.includes('session expired') ||
    normalizedMessage.includes('session not found') ||
    normalizedMessage.includes('invalid token') ||
    normalizedMessage.includes('token expired')
  ) {
    return 'Sua sessão expirou. Faça login novamente.'
  }

  if (
    normalizedMessage.includes('already exists') ||
    normalizedMessage.includes('already been taken') ||
    normalizedMessage.includes('duplicate')
  ) {
    return 'Já existe uma conta com este email.'
  }

  if (
    normalizedMessage.includes('too many requests') ||
    normalizedMessage.includes('rate limit') ||
    normalizedMessage.includes('too many attempts')
  ) {
    return 'Muitas tentativas. Aguarde alguns segundos e tente novamente.'
  }

  if (normalizedMessage.includes('payload too large') || normalizedMessage.includes('file too large')) {
    return 'Imagem muito grande. Envie um arquivo menor.'
  }

  if (normalizedMessage.includes('network error') || normalizedMessage.includes('failed to fetch')) {
    return 'Não foi possível conectar ao servidor. Verifique sua internet e tente novamente.'
  }

  if (normalizedMessage.includes('not found')) {
    return 'Recurso não encontrado.'
  }

  if (status === 401) {
    return 'Sua sessão expirou. Faça login novamente.'
  }

  return null
}

function isSafeValidationMessage(message: string) {
  const trimmed = message.trim()
  if (!trimmed || trimmed.length > 160) {
    return false
  }

  const lowered = trimmed.toLowerCase()
  const blockedTerms = [
    'exception',
    'stack',
    'trace',
    'assert',
    'internal',
    'select ',
    'insert ',
    'update ',
    'delete ',
    'syntaxerror',
    'referenceerror',
    'typeerror',
    '{',
    '}',
    '<',
    '>',
  ]

  return !blockedTerms.some((term) => lowered.includes(term))
}

export function mapApiErrorMessage(status: number, body: ApiErrorBody | null) {
  const detailMessage = body?.details?.[0]?.mensagem
  if (detailMessage && isSafeValidationMessage(detailMessage)) {
    return detailMessage
  }

  const normalized = translateKnownApiError(
    body?.detail ?? body?.mensagem ?? body?.error ?? body?.message ?? body?.title,
    body?.code,
    status
  )
  if (normalized) {
    return normalized
  }

  switch (status) {
    case 401:
      return 'Sua sessão expirou. Faça login novamente.'
    case 404:
      return 'Recurso não encontrado.'
    case 413:
      return 'Imagem muito grande. Envie um arquivo menor.'
    case 422:
      return 'Dados inválidos. Revise os campos.'
    case 429:
      return 'Muitas tentativas. Aguarde alguns segundos e tente novamente.'
    case 503:
      return 'Serviço indisponível no momento. Tente novamente em instantes.'
    case 0:
      return 'Não foi possível conectar ao servidor. Verifique sua internet e tente novamente.'
    default:
      return 'Erro inesperado. Tente novamente.'
  }
}

async function request<T>(path: string, options: RequestOptions = {}) {
  const { method = 'GET', token, body, query, headers: customHeaders, timeoutMs = DEFAULT_TIMEOUT_MS } = options
  const headers: Record<string, string> = {
    Accept: 'application/json',
    ...(customHeaders ?? {}),
  }

  if (body) {
    headers['Content-Type'] = 'application/json'
  }
  if (token) {
    headers.Authorization = `Bearer ${token}`
  }

  let response: Response
  const controller = typeof AbortController !== 'undefined' ? new AbortController() : null
  const timeoutId = setTimeout(() => {
    controller?.abort()
  }, timeoutMs)

  try {
    response = await fetch(buildUrl(path, query), {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
      signal: controller?.signal,
    })
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      throw new ApiError('Tempo limite de conexão atingido. Tente novamente.', 0, null)
    }
    throw new ApiError(
      'Não foi possível conectar ao servidor. Verifique sua internet e tente novamente.',
      0,
      null
    )
  } finally {
    clearTimeout(timeoutId)
  }

  const contentType = response.headers.get('content-type') || ''
  const text = await response.text()
  let parsed: unknown = null

  if (text.length > 0 && contentType.includes('application/json')) {
    try {
      parsed = JSON.parse(text)
    } catch {
      parsed = null
    }
  }

  if (!response.ok) {
    const errorBody = parsed && typeof parsed === 'object' ? (parsed as ApiErrorBody) : null
    throw new ApiError(mapApiErrorMessage(response.status, errorBody), response.status, errorBody)
  }

  return (parsed as T) ?? ({} as T)
}

export type AuthResponse = {
  token: string
  user: AuthUser
}

export async function signUpEmail(input: { name: string; email: string; password: string }) {
  return request<AuthResponse>('/api/auth/sign-up/email', {
    method: 'POST',
    body: input,
  })
}

export async function signInEmail(input: { email: string; password: string }) {
  return request<AuthResponse>('/api/auth/sign-in/email', {
    method: 'POST',
    body: input,
  })
}

export async function signOut(token: string) {
  return request<{ success?: boolean }>('/api/auth/sign-out', {
    method: 'POST',
    token,
    body: {},
  })
}

export async function getMe(token: string) {
  return request<MeResponse>('/api/users/me', { token })
}

export async function completeOnboarding(
  token: string,
  input: {
    sex: 'male' | 'female'
    birthDate: string
    heightCm: number
    weightKg: number
    activityLevel: 'sedentary' | 'light' | 'moderate' | 'active' | 'very_active'
    goalType: 'lose' | 'maintain' | 'gain'
    timezone: string
  }
) {
  return request('/api/users/onboarding', {
    method: 'POST',
    token,
    body: input,
  })
}

export async function getDashboard(token: string, date: string) {
  return request<DashboardResponse>('/api/users/dashboard', {
    token,
    query: { date },
  })
}

export async function getMealsByDate(token: string, date: string) {
  return request<{ meals: DashboardResponse['meals'] }>('/api/meals', {
    token,
    query: { date },
  })
}

export async function getHistory(token: string, days = 7) {
  return request<HistoryResponse>('/api/meals/history', {
    token,
    query: { days },
  })
}

export async function deleteMeal(token: string, mealId: string) {
  return request<{ ok: boolean }>(`/api/meals/${mealId}`, {
    method: 'DELETE',
    token,
  })
}

export async function analyzeMeal(
  token: string,
  input: {
    imageBase64: string
    mealType: MealType
    localDate: string
  }
) {
  return request<AnalysisResponse>('/api/meals/analyze', {
    method: 'POST',
    token,
    body: input,
  })
}

export async function createMealFromAnalysis(
  token: string,
  input: {
    name: string
    mealType: MealType
    calories: number
    protein: number
    carbs: number
    fat: number
    localDate: string
    imageKey?: string
    analysisToken?: string
    foodsDetected?: FoodItem[]
    aiConfidence?: 'high' | 'medium' | 'low'
    isManualEntry?: boolean
    operationId: string
  }
) {
  const { operationId, ...payload } = input
  return request<{ meal: DashboardResponse['meals'][number] }>('/api/meals/manual', {
    method: 'POST',
    token,
    body: payload,
    headers: {
      'Idempotency-Key': operationId,
    },
  })
}
