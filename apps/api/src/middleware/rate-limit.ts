import { createMiddleware } from 'hono/factory'
import type { Env } from '../types'
import { getServerDate } from '../lib/server-date'

type RateLimitEnv = {
  Bindings: Env
  Variables: {
    user: { id: string; email: string; name: string }
  }
}

export const rateLimitAnalysis = createMiddleware<RateLimitEnv>(async (c, next) => {
  const userId = c.var.user.id
  const date = getServerDate()

  const result = await c.env.DB.prepare(
    `SELECT COUNT(*) as count FROM analysis_events WHERE user_id = ? AND local_date = ?`
  ).bind(userId, date).first<{ count: number }>()

  const count = result?.count ?? 0

  if (count >= 50) {
    return c.json({
      error: 'Limite de análises atingido',
      mensagem: 'Você atingiu o limite de 50 análises por dia. Tente novamente amanhã.',
      limite: 50,
      usado: count,
    }, 429)
  }

  await next()
})
