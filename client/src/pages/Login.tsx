import { useState, type FormEvent } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { api } from '../api/client'
import { useStore } from '../store'

export default function Login() {
  const navigate = useNavigate()
  const setAuth = useStore((s) => s.setAuth)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      const { token, userId } = await api.auth.login(email, password)
      setAuth(token, userId, email)
      navigate('/schedules')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'ログインに失敗しました')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="auth-wrap">
      <div className="auth-card">
        <h1>シフト管理</h1>
        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label>メールアドレス</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoFocus
            />
          </div>
          <div className="form-group">
            <label>パスワード</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </div>
          {error && <p className="error-msg">{error}</p>}
          <button className="btn btn-primary" type="submit" disabled={loading}>
            {loading ? 'ログイン中...' : 'ログイン'}
          </button>
        </form>
        <div className="link-row">
          アカウント未登録? <Link to="/register">新規登録</Link>
        </div>
      </div>
    </div>
  )
}
