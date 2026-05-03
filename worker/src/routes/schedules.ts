import { Hono } from 'hono'
import type { Env, AuthVariables } from '../types'
import { authMiddleware } from '../middleware/auth'
import { generateId } from '../lib/id'

type EntryInput = { staff_id: string; date: string; task_type: string }

export const scheduleRoutes = new Hono<{ Bindings: Env; Variables: AuthVariables }>()

scheduleRoutes.use('*', authMiddleware)

scheduleRoutes.get('/', async (c) => {
  const workspaceId = c.get('workspaceId')
  const { results } = await c.env.DB.prepare(
    'SELECT id, year, month, created_at FROM schedules WHERE workspace_id = ? ORDER BY year DESC, month DESC',
  )
    .bind(workspaceId)
    .all<{ id: string; year: number; month: number; created_at: string }>()
  return c.json(results)
})

scheduleRoutes.post('/', async (c) => {
  const workspaceId = c.get('workspaceId')
  const body = await c.req.json<{ year?: number; month?: number }>()
  const { year, month } = body

  if (!year || !month || month < 1 || month > 12) {
    return c.json({ error: 'Valid year and month required' }, 400)
  }

  const existing = await c.env.DB.prepare(
    'SELECT id FROM schedules WHERE workspace_id = ? AND year = ? AND month = ?',
  )
    .bind(workspaceId, year, month)
    .first()

  if (existing) {
    return c.json({ error: 'Schedule already exists for this month' }, 409)
  }

  const id = generateId()
  await c.env.DB.prepare(
    'INSERT INTO schedules (id, workspace_id, year, month) VALUES (?, ?, ?, ?)',
  )
    .bind(id, workspaceId, year, month)
    .run()

  return c.json({ id, year, month }, 201)
})

scheduleRoutes.get('/:id', async (c) => {
  const workspaceId = c.get('workspaceId')
  const scheduleId = c.req.param('id')

  const schedule = await c.env.DB.prepare(
    'SELECT id, year, month FROM schedules WHERE id = ? AND workspace_id = ?',
  )
    .bind(scheduleId, workspaceId)
    .first<{ id: string; year: number; month: number }>()

  if (!schedule) {
    return c.json({ error: 'Schedule not found' }, 404)
  }

  const { results: entries } = await c.env.DB.prepare(
    `SELECT se.id, se.staff_id, se.date, se.task_type, s.name as staff_name
     FROM schedule_entries se
     JOIN staff s ON se.staff_id = s.id
     WHERE se.schedule_id = ?
     ORDER BY se.date, s.name`,
  )
    .bind(scheduleId)
    .all()

  return c.json({ ...schedule, entries })
})

scheduleRoutes.put('/:id/entries', async (c) => {
  const workspaceId = c.get('workspaceId')
  const scheduleId = c.req.param('id')

  const schedule = await c.env.DB.prepare(
    'SELECT id FROM schedules WHERE id = ? AND workspace_id = ?',
  )
    .bind(scheduleId, workspaceId)
    .first()

  if (!schedule) {
    return c.json({ error: 'Schedule not found' }, 404)
  }

  const body = await c.req.json<{ entries?: EntryInput[] }>()
  const entries = body.entries ?? []

  const stmts = [
    c.env.DB.prepare('DELETE FROM schedule_entries WHERE schedule_id = ?').bind(scheduleId),
    ...entries.map((e) =>
      c.env.DB.prepare(
        'INSERT INTO schedule_entries (id, schedule_id, staff_id, date, task_type) VALUES (?, ?, ?, ?, ?)',
      ).bind(generateId(), scheduleId, e.staff_id, e.date, e.task_type),
    ),
  ]

  await c.env.DB.batch(stmts)
  return c.json({ ok: true, count: entries.length })
})
