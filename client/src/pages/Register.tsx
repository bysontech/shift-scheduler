import { useState, type FormEvent } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { api } from '../api/client'
import { useStore } from '../store'

export default function Register() {
  const navigate = useNavigate()
  const setAuth = useStore((s) => s.setAuth)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError('')
    if (password.length < 8) {
      setError('パスワードは8文字以上にしてください')
      return
    }
    setLoading(true)
    try {
      const { token, userId } = await api.auth.register(email, password)
      setAuth(token, userId, email)
      navigate('/schedules')
    } catch (err) {
      setError(err instanceof Error ? err.message : '登録に失敗しました')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="auth-wrap">
      <div className="auth-card">
        <h1>新規登録</h1>
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
            <label>パスワード（8文字以上）</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={8}
            />
          </div>
          {error && <p className="error-msg">{error}</p>}
          <button className="btn btn-primary" type="submit" disabled={loading}>
            {loading ? '登録中...' : '登録する'}
          </button>
        </form>
        <div className="link-row">
          既にアカウントをお持ちの方は <Link to="/login">ログイン</Link>
        </div>
      </div>
    </div>
  )
}
