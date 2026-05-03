import { useEffect, useState, type FormEvent } from 'react'
import { api } from '../api/client'
import { useStore } from '../store'

export default function StaffList() {
  const { staff, setStaff } = useStore((s) => ({ staff: s.staff, setStaff: s.setStaff }))
  const [name, setName] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    api.staff.list().then(setStaff).catch(() => setError('職員の取得に失敗しました'))
  }, [setStaff])

  async function handleAdd(e: FormEvent) {
    e.preventDefault()
    if (!name.trim()) return
    setError('')
    setLoading(true)
    try {
      const newStaff = await api.staff.create(name.trim())
      setStaff([...staff, { ...newStaff, created_at: new Date().toISOString() }])
      setName('')
    } catch (err) {
      setError(err instanceof Error ? err.message : '追加に失敗しました')
    } finally {
      setLoading(false)
    }
  }

  async function handleDelete(id: string) {
    if (!window.confirm('削除しますか？')) return
    try {
      await api.staff.delete(id)
      setStaff(staff.filter((s) => s.id !== id))
    } catch (err) {
      setError(err instanceof Error ? err.message : '削除に失敗しました')
    }
  }

  return (
    <div className="page">
      <h1>職員管理</h1>

      <div className="card">
        <h2>職員追加</h2>
        <form onSubmit={handleAdd}>
          <div className="form-row">
            <div className="form-group">
              <label>氏名</label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="例: 山田 太郎"
                required
              />
            </div>
            <button className="btn btn-primary" type="submit" disabled={loading}>
              {loading ? '追加中...' : '追加'}
            </button>
          </div>
          {error && <p className="error-msg">{error}</p>}
        </form>
      </div>

      <div className="card">
        <h2>職員一覧（{staff.length}名）</h2>
        {staff.length === 0 ? (
          <p style={{ color: '#888' }}>職員が登録されていません</p>
        ) : (
          <ul className="list">
            {staff.map((s) => (
              <li key={s.id} className="list-item">
                <span>{s.name}</span>
                <button className="btn btn-danger" onClick={() => handleDelete(s.id)}>
                  削除
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}
