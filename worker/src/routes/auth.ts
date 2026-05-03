import { Hono } from 'hono'
import type { Env, AuthVariables } from '../types'
import { hashPassword, verifyPassword } from '../lib/password'
import { signJwt, verifyJwt } from '../lib/jwt'
import { generateId } from '../lib/id'

export const authRoutes = new Hono<{ Bindings: Env; Variables: AuthVariables }>()

authRoutes.post('/register', async (c) => {
  const body = await c.req.json<{ email?: string; password?: string }>()
  const { email, password } = body

  if (!email?.trim() || !password) {
    return c.json({ error: 'Email and password required' }, 400)
  }

  const existing = await c.env.DB.prepare('SELECT id FROM users WHERE email = ?')
    .bind(email.trim())
    .first()
  if (existing) {
    return c.json({ error: 'Email already registered' }, 409)
  }

  const userId = generateId()
  const passwordHash = await hashPassword(password)
  const workspaceId = generateId()

  await c.env.DB.batch([
    c.env.DB.prepare('INSERT INTO users (id, email, password_hash) VALUES (?, ?, ?)').bind(
      userId,
      email.trim(),
      passwordHash,
    ),
    c.env.DB.prepare('INSERT INTO workspaces (id, user_id, name) VALUES (?, ?, ?)').bind(
      workspaceId,
      userId,
      '既定のワークスペース',
    ),
  ])

  const secret = c.env.JWT_SECRET ?? 'dev-only-secret-change-in-production'
  const token = await signJwt(userId, secret)
  return c.json({ token, userId }, 201)
})

authRoutes.post('/login', async (c) => {
  const body = await c.req.json<{ email?: string; password?: string }>()
  const { email, password } = body

  if (!email?.trim() || !password) {
    return c.json({ error: 'Email and password required' }, 400)
  }

  const user = await c.env.DB.prepare(
    'SELECT id, password_hash FROM users WHERE email = ?',
  )
    .bind(email.trim())
    .first<{ id: string; password_hash: string }>()

  if (!user || !(await verifyPassword(password, user.password_hash))) {
    return c.json({ error: 'Invalid credentials' }, 401)
  }

  const secret = c.env.JWT_SECRET ?? 'dev-only-secret-change-in-production'
  const token = await signJwt(user.id, secret)
  return c.json({ token, userId: user.id })
})

authRoutes.get('/me', async (c) => {
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

  const user = await c.env.DB.prepare('SELECT id, email FROM users WHERE id = ?')
    .bind(payload.sub)
    .first<{ id: string; email: string }>()

  if (!user) {
    return c.json({ error: 'User not found' }, 404)
  }

  return c.json({ id: user.id, email: user.email })
})
