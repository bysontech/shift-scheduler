import { useEffect, useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { api } from '../api/client'
import { useStore } from '../store'

export default function ScheduleList() {
  const { schedules, setSchedules } = useStore((s) => ({
    schedules: s.schedules,
    setSchedules: s.setSchedules,
  }))
  const [year, setYear] = useState(() => new Date().getFullYear())
  const [month, setMonth] = useState(() => new Date().getMonth() + 1)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    api.schedules.list().then(setSchedules).catch(() => setError('勤務表の取得に失敗しました'))
  }, [setSchedules])

  async function handleCreate(e: FormEvent) {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      const s = await api.schedules.create(year, month)
      setSchedules([{ ...s, created_at: new Date().toISOString() }, ...schedules])
    } catch (err) {
      setError(err instanceof Error ? err.message : '作成に失敗しました')
    } finally {
      setLoading(false)
    }
  }

  const currentYear = new Date().getFullYear()
  const years = [currentYear - 1, currentYear, currentYear + 1]
  const months = Array.from({ length: 12 }, (_, i) => i + 1)

  return (
    <div className="page">
      <h1>勤務表</h1>

      <div className="card">
        <h2>新規作成</h2>
        <form onSubmit={handleCreate}>
          <div className="form-row">
            <div className="form-group">
              <label>年</label>
              <select value={year} onChange={(e) => setYear(Number(e.target.value))}>
                {years.map((y) => (
                  <option key={y} value={y}>{y}年</option>
                ))}
              </select>
            </div>
            <div className="form-group">
              <label>月</label>
              <select value={month} onChange={(e) => setMonth(Number(e.target.value))}>
                {months.map((m) => (
                  <option key={m} value={m}>{m}月</option>
                ))}
              </select>
            </div>
            <button className="btn btn-primary" type="submit" disabled={loading}>
              {loading ? '作成中...' : '作成'}
            </button>
          </div>
          {error && <p className="error-msg">{error}</p>}
        </form>
      </div>

      <div className="card">
        <h2>一覧</h2>
        {schedules.length === 0 ? (
          <p style={{ color: '#888' }}>勤務表がありません。上のフォームから作成してください。</p>
        ) : (
          <div className="schedule-list">
            {schedules.map((s) => (
              <Link key={s.id} to={`/schedules/${s.id}`} className="schedule-card">
                <div className="year-month">
                  {s.year}年{s.month}月
                </div>
                <div className="created">
                  作成日: {new Date(s.created_at).toLocaleDateString('ja-JP')}
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
