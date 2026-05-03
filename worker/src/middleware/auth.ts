import type { MiddlewareHandler } from 'hono'
import { verifyJwt } from '../lib/jwt'
import type { Env, AuthVariables } from '../types'

export const authMiddleware: MiddlewareHandler<{
  Bindings: Env
  Variables: AuthVariables
}> = async (c, next) => {
  const authHeader = c.req.header('Authorization')
  if (!authHeader?.startsWith('Bearer ')) {
    return c.json({ error: 'Unauthorized' }, 401)
  }

  const token = authHeader.slice(7)
  const secret = c.env.JWT_SECRET ?? 'dev-only-secret-change-in-production'
  const payload = await verifyJwt(token, secret)
  if (!payload) {
    return c.json({ error: 'Invalid token' }, 401)
  }

  const workspace = await c.env.DB.prepare(
    'SELECT id FROM workspaces WHERE user_id = ? LIMIT 1',
  )
    .bind(payload.sub)
    .first<{ id: string }>()

  if (!workspace) {
    return c.json({ error: 'Workspace not found' }, 404)
  }

  c.set('userId', payload.sub as string)
  c.set('workspaceId', workspace.id)
  await next()
}
