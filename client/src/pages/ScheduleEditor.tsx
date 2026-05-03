import { useEffect, useRef, useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import { api, type ScheduleDetail } from '../api/client'
import { useStore } from '../store'
import type { SolverInput, SolverOutput } from '../workers/solver.worker'
import SolverWorker from '../workers/solver.worker?worker'

type EntryMap = Map<string, string> // key: `${staffId}|${date}`, value: taskType

function entryKey(staffId: string, date: string) {
  return `${staffId}|${date}`
}

function taskClass(task: string): string {
  if (task === '日勤') return 'task-day'
  if (task === '当直') return 'task-night'
  if (task === '休み') return 'task-off'
  if (task === '明休') return 'task-post'
  return 'task-empty'
}

const TASK_OPTIONS = ['日勤', '当直', '明休', '休み', '']

export default function ScheduleEditor() {
  const { id } = useParams<{ id: string }>()
  const staff = useStore((s) => s.staff)
  const setStaff = useStore((s) => s.setStaff)
  const [schedule, setSchedule] = useState<ScheduleDetail | null>(null)
  const [entries, setEntries] = useState<EntryMap>(new Map())
  const [generating, setGenerating] = useState(false)
  const [saving, setSaving] = useState(false)
  const [solverStatus, setSolverStatus] = useState<'success' | 'partial' | null>(null)
  const [error, setError] = useState('')
  const [savedMsg, setSavedMsg] = useState('')
  const workerRef = useRef<Worker | null>(null)

  useEffect(() => {
    if (!id) return
    Promise.all([
      api.schedules.get(id),
      staff.length === 0 ? api.staff.list() : Promise.resolve(staff),
    ]).then(([sched, staffList]) => {
      setSchedule(sched as ScheduleDetail)
      if (Array.isArray(staffList)) setStaff(staffList)

      const map = new Map<string, string>()
      for (const e of (sched as ScheduleDetail).entries) {
        map.set(entryKey(e.staff_id, e.date), e.task_type)
      }
      setEntries(map)
    }).catch(() => setError('データの取得に失敗しました'))

    return () => {
      workerRef.current?.terminate()
    }
  }, [id]) // eslint-disable-line react-hooks/exhaustive-deps

  function handleGenerate() {
    if (!schedule || staff.length === 0) {
      setError('職員が登録されていません')
      return
    }
    setError('')
    setGenerating(true)
    setSolverStatus(null)

    workerRef.current?.terminate()
    const worker = new SolverWorker()
    workerRef.current = worker

    const input: SolverInput = { staff, year: schedule.year, month: schedule.month }
    worker.postMessage(input)

    worker.onmessage = (e: MessageEvent<SolverOutput>) => {
      const result = e.data
      const map = new Map<string, string>()
      for (const entry of result.entries) {
        map.set(entryKey(entry.staff_id, entry.date), entry.task_type)
      }
      setEntries(map)
      setSolverStatus(result.status)
      setGenerating(false)
      worker.terminate()
    }
  }

  async function handleSave() {
    if (!id || !schedule) return
    setSaving(true)
    setSavedMsg('')
    setError('')
    try {
      const entriesArray = Array.from(entries.entries())
        .filter(([, task]) => task !== '')
        .map(([key, task_type]) => {
          const sep = key.indexOf('|')
          return { staff_id: key.slice(0, sep), date: key.slice(sep + 1), task_type }
        })
      await api.schedules.saveEntries(id, entriesArray)
      setSavedMsg('保存しました')
      setTimeout(() => setSavedMsg(''), 3000)
    } catch (err) {
      setError(err instanceof Error ? err.message : '保存に失敗しました')
    } finally {
      setSaving(false)
    }
  }

  function handleCellChange(staffId: string, date: string, task: string) {
    const map = new Map(entries)
    if (task === '') {
      map.delete(entryKey(staffId, date))
    } else {
      map.set(entryKey(staffId, date), task)
    }
    setEntries(map)
  }

  if (!schedule) {
    return <div className="page">{error || '読み込み中...'}</div>
  }

  const daysInMonth = new Date(schedule.year, schedule.month, 0).getDate()
  const days = Array.from({ length: daysInMonth }, (_, i) => i + 1)
  const dayLabels = days.map((d) => {
    const date = new Date(schedule.year, schedule.month - 1, d)
    const dow = ['日', '月', '火', '水', '木', '金', '土'][date.getDay()]
    return { d, dow, isWeekend: date.getDay() === 0 || date.getDay() === 6 }
  })

  return (
    <div className="page">
      <div className="toolbar">
        <Link to="/schedules" className="btn btn-secondary">← 一覧へ</Link>
        <h1 style={{ margin: 0 }}>
          {schedule.year}年{schedule.month}月 勤務表
        </h1>
        <span className="spacer" />
        {solverStatus && (
          <span className={`status-badge ${solverStatus === 'success' ? 'status-success' : 'status-partial'}`}>
            {solverStatus === 'success' ? '生成完了' : '一部未割当'}
          </span>
        )}
        <button
          className="btn btn-success"
          onClick={handleGenerate}
          disabled={generating || staff.length === 0}
        >
          {generating ? '生成中...' : '自動生成'}
        </button>
        <button className="btn btn-primary" onClick={handleSave} disabled={saving}>
          {saving ? '保存中...' : '保存'}
        </button>
      </div>

      {error && <p className="error-msg" style={{ marginBottom: 10 }}>{error}</p>}
      {savedMsg && <p className="success-msg" style={{ marginBottom: 10 }}>{savedMsg}</p>}

      {staff.length === 0 ? (
        <div className="card">
          <p>職員が登録されていません。<Link to="/staff">職員管理</Link>から追加してください。</p>
        </div>
      ) : (
        <div className="card" style={{ padding: '12px' }}>
          <div className="grid-wrap">
            <table className="schedule-grid">
              <thead>
                <tr>
                  <th>職員</th>
                  {dayLabels.map(({ d, dow, isWeekend }) => (
                    <th
                      key={d}
                      style={{ color: isWeekend ? (dow === '日' ? '#e74c3c' : '#1565c0') : undefined }}
                    >
                      {d}<br />{dow}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {staff.map((s) => (
                  <tr key={s.id}>
                    <td className="staff-name">{s.name}</td>
                    {days.map((d) => {
                      const date = `${schedule.year}-${String(schedule.month).padStart(2, '0')}-${String(d).padStart(2, '0')}`
                      const task = entries.get(entryKey(s.id, date)) ?? ''
                      return (
                        <td key={d} className={taskClass(task)}>
                          <select
                            value={task}
                            onChange={(e) => handleCellChange(s.id, date, e.target.value)}
                            style={{
                              border: 'none',
                              background: 'transparent',
                              cursor: 'pointer',
                              fontSize: '12px',
                              width: '100%',
                            }}
                          >
                            {TASK_OPTIONS.map((t) => (
                              <option key={t} value={t}>{t || '—'}</option>
                            ))}
                          </select>
                        </td>
                      )
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div style={{ marginTop: 12, fontSize: 12, color: '#666', display: 'flex', gap: 16 }}>
            <span><span className="status-badge" style={{ background: '#e8f5e9', color: '#1b5e20' }}>日勤</span></span>
            <span><span className="status-badge" style={{ background: '#fff3e0', color: '#e65100' }}>当直</span></span>
            <span><span className="status-badge" style={{ background: '#f3e5f5', color: '#4a148c' }}>明休</span></span>
            <span><span className="status-badge" style={{ background: '#e3f2fd', color: '#0d47a1' }}>休み</span></span>
          </div>
        </div>
      )}
    </div>
  )
}
