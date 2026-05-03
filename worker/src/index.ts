import { Hono } from 'hono'
import { cors } from 'hono/cors'
import type { Env } from './types'
import { authRoutes } from './routes/auth'
import { staffRoutes } from './routes/staff'
import { scheduleRoutes } from './routes/schedules'

const app = new Hono<{ Bindings: Env }>()

app.use(
  '*',
  cors({
    origin: ['http://localhost:5173', 'https://shift-scheduler.pages.dev'],
    allowHeaders: ['Content-Type', 'Authorization'],
    allowMethods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    credentials: true,
  }),
)

app.route('/auth', authRoutes)
app.route('/staff', staffRoutes)
app.route('/schedules', scheduleRoutes)

app.get('/health', (c) => c.json({ ok: true }))

export default app
