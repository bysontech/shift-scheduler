import { create } from 'zustand'
import type { Staff, Schedule, ScheduleDetail } from '../api/client'

type Store = {
  // auth
  token: string | null
  userId: string | null
  email: string | null
  setAuth: (token: string, userId: string, email?: string) => void
  clearAuth: () => void

  // staff
  staff: Staff[]
  setStaff: (staff: Staff[]) => void

  // schedules
  schedules: Schedule[]
  setSchedules: (schedules: Schedule[]) => void
  currentSchedule: ScheduleDetail | null
  setCurrentSchedule: (s: ScheduleDetail | null) => void
}

export const useStore = create<Store>((set) => ({
  token: localStorage.getItem('token'),
  userId: localStorage.getItem('userId'),
  email: localStorage.getItem('email'),

  setAuth: (token, userId, email) => {
    localStorage.setItem('token', token)
    localStorage.setItem('userId', userId)
    if (email) localStorage.setItem('email', email)
    set({ token, userId, email: email ?? null })
  },
  clearAuth: () => {
    localStorage.removeItem('token')
    localStorage.removeItem('userId')
    localStorage.removeItem('email')
    set({ token: null, userId: null, email: null })
  },

  staff: [],
  setStaff: (staff) => set({ staff }),

  schedules: [],
  setSchedules: (schedules) => set({ schedules }),
  currentSchedule: null,
  setCurrentSchedule: (s) => set({ currentSchedule: s }),
}))
