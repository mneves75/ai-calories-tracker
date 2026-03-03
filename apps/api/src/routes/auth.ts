import { Hono } from 'hono'
import { createAuth } from '../lib/auth'
import { authRateLimit } from '../middleware/auth-rate-limit'
import type { Env } from '../types'

const authRoutes = new Hono<{ Bindings: Env }>()

authRoutes.use('/auth/*', authRateLimit)

authRoutes.all('/auth/*', async (c) => {
  const auth = createAuth(c.env)
  return auth.handler(c.req.raw)
})

export { authRoutes }
