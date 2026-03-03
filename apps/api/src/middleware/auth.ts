import { createMiddleware } from 'hono/factory'
import { createAuth } from '../lib/auth'
import type { Env } from '../types'

type AuthEnv = {
  Bindings: Env
  Variables: {
    user: { id: string; email: string; name: string }
    session: { id: string; userId: string; token: string }
  }
}

export const authMiddleware = createMiddleware<AuthEnv>(async (c, next) => {
  const auth = createAuth(c.env)
  const session = await auth.api.getSession({ headers: c.req.raw.headers })

  if (!session) {
    return c.json({ error: 'Não autorizado' }, 401)
  }

  c.set('user', session.user as { id: string; email: string; name: string })
  c.set('session', session.session as { id: string; userId: string; token: string })
  await next()
})
