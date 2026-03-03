import { betterAuth } from 'better-auth'
import { drizzleAdapter } from 'better-auth/adapters/drizzle'
import { bearer } from 'better-auth/plugins'
import { drizzle } from 'drizzle-orm/d1'
import * as schema from '../db/schema'
import { hashPasswordForWorkers, verifyPasswordForWorkers } from './password-hash'
import type { Env } from '../types'

let cachedAuth: { signature: string; instance: unknown } | null = null

function resolveEnvironment(value: string) {
  if (value === 'local' || value === 'development' || value === 'test' || value === 'staging' || value === 'production') {
    return value
  }
  throw new Error(`ENVIRONMENT inválido: ${value}`)
}

export function createAuth(env: Env) {
  const secret = env.BETTER_AUTH_SECRET?.trim()
  const baseURL = env.BETTER_AUTH_URL?.trim()
  const environment = resolveEnvironment(env.ENVIRONMENT)
  const isTestEnv = environment === 'test'

  if (!secret || (!isTestEnv && secret.length < 16)) {
    throw new Error('BETTER_AUTH_SECRET inválido: use um segredo forte com pelo menos 16 caracteres')
  }

  if (!baseURL) {
    throw new Error('BETTER_AUTH_URL não configurado')
  }

  let parsedBaseURL: URL
  try {
    parsedBaseURL = new URL(baseURL)
  } catch {
    throw new Error('BETTER_AUTH_URL inválido')
  }

  if (environment === 'production' && parsedBaseURL.protocol !== 'https:') {
    throw new Error('BETTER_AUTH_URL deve usar HTTPS em produção')
  }

  const signature = `${environment}|${baseURL}|${secret}`
  if (cachedAuth && cachedAuth.signature === signature) {
    return cachedAuth.instance as ReturnType<typeof betterAuth>
  }

  const db = drizzle(env.DB, { schema })

  const trustedOrigins = ['aicaloriestracker://']
  if (environment !== 'production') {
    trustedOrigins.push('http://localhost:8081', 'http://127.0.0.1:8081')
  }

  const instance = betterAuth({
    baseURL,
    secret,
    database: drizzleAdapter(db, {
      provider: 'sqlite',
      usePlural: true,
      schema: {
        user: schema.users,
        users: schema.users,
        session: schema.sessions,
        sessions: schema.sessions,
        account: schema.accounts,
        accounts: schema.accounts,
        verification: schema.verifications,
        verifications: schema.verifications,
      },
    }),
    emailAndPassword: {
      enabled: true,
      password: {
        hash: hashPasswordForWorkers,
        verify: verifyPasswordForWorkers,
      },
    },
    rateLimit: {
      enabled: false,
    },
    plugins: [bearer()],
    trustedOrigins,
  })

  cachedAuth = { signature, instance }
  return instance
}
