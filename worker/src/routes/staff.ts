import { Hono } from 'hono'
import type { Env, AuthVariables } from '../types'
import { authMiddleware } from '../middleware/auth'
import { generateId } from '../lib/id'

export const staffRoutes = new Hono<{ Bindings: Env; Variables: AuthVariables }>()

staffRoutes.use('*', authMiddleware)

staffRoutes.get('/', async (c) => {
  const workspaceId = c.get('workspaceId')
  const { results } = await c.env.DB.prepare(
    'SELECT id, name, created_at FROM staff WHERE workspace_id = ? ORDER BY created_at ASC',
  )
    .bind(workspaceId)
    .all<{ id: string; name: string; created_at: string }>()
  return c.json(results)
})

staffRoutes.post('/', async (c) => {
  const workspaceId = c.get('workspaceId')
  const body = await c.req.json<{ name?: string }>()

  if (!body.name?.trim()) {
    return c.json({ error: 'Name required' }, 400)
  }

  const id = generateId()
  const name = body.name.trim()
  await c.env.DB.prepare(
    'INSERT INTO staff (id, workspace_id, name) VALUES (?, ?, ?)',
  )
    .bind(id, workspaceId, name)
    .run()

  return c.json({ id, name }, 201)
})

staffRoutes.delete('/:id', async (c) => {
  const workspaceId = c.get('workspaceId')
  const staffId = c.req.param('id')

  const staff = await c.env.DB.prepare(
    'SELECT id FROM staff WHERE id = ? AND workspace_id = ?',
  )
    .bind(staffId, workspaceId)
    .first()

  if (!staff) {
    return c.json({ error: 'Staff not found' }, 404)
  }

  await c.env.DB.prepare('DELETE FROM staff WHERE id = ?').bind(staffId).run()
  return c.json({ ok: true })
})
