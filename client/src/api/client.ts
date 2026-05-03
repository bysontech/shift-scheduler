const BASE_URL = '/api'

function getToken(): string | null {
  return localStorage.getItem('token')
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const token = getToken()
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  }

  const res = await fetch(`${BASE_URL}${path}`, { ...options, headers })
  if (!res.ok) {
    let message = res.statusText
    try {
      const err = (await res.json()) as { error?: string }
      if (err.error) message = err.error
    } catch {
      // ignore parse error
    }
    throw new Error(message)
  }
  return res.json() as Promise<T>
}

export type Staff = {
  id: string
  name: string
  created_at: string
}

export type Schedule = {
  id: string
  year: number
  month: number
  created_at: string
}

export type ScheduleEntry = {
  id: string
  staff_id: string
  staff_name: string
  date: string
  task_type: string
}

export type ScheduleDetail = Schedule & { entries: ScheduleEntry[] }

export type EntryInput = {
  staff_id: string
  date: string
  task_type: string
}

export const api = {
  auth: {
    register: (email: string, password: string) =>
      request<{ token: string; userId: string }>('/auth/register', {
        method: 'POST',
        body: JSON.stringify({ email, password }),
      }),
    login: (email: string, password: string) =>
      request<{ token: string; userId: string }>('/auth/login', {
        method: 'POST',
        body: JSON.stringify({ email, password }),
      }),
    me: () => request<{ id: string; email: string }>('/auth/me'),
  },
  staff: {
    list: () => request<Staff[]>('/staff'),
    create: (name: string) =>
      request<Staff>('/staff', { method: 'POST', body: JSON.stringify({ name }) }),
    delete: (id: string) =>
      request<{ ok: boolean }>(`/staff/${id}`, { method: 'DELETE' }),
  },
  schedules: {
    list: () => request<Schedule[]>('/schedules'),
    create: (year: number, month: number) =>
      request<Schedule>('/schedules', {
        method: 'POST',
        body: JSON.stringify({ year, month }),
      }),
    get: (id: string) => request<ScheduleDetail>(`/schedules/${id}`),
    saveEntries: (id: string, entries: EntryInput[]) =>
      request<{ ok: boolean; count: number }>(`/schedules/${id}/entries`, {
        method: 'PUT',
        body: JSON.stringify({ entries }),
      }),
  },
}
