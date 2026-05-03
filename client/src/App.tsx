import { BrowserRouter, Routes, Route, Navigate, Link, useNavigate } from 'react-router-dom'
import { useStore } from './store'
import Login from './pages/Login'
import Register from './pages/Register'
import StaffList from './pages/StaffList'
import ScheduleList from './pages/ScheduleList'
import ScheduleEditor from './pages/ScheduleEditor'

function Nav() {
  const { token, email, clearAuth } = useStore((s) => ({
    token: s.token,
    email: s.email,
    clearAuth: s.clearAuth,
  }))
  const navigate = useNavigate()

  if (!token) return null

  function logout() {
    clearAuth()
    navigate('/login')
  }

  return (
    <nav className="app-nav">
      <Link to="/schedules" style={{ fontWeight: 700, color: '#fff' }}>シフト管理</Link>
      <Link to="/schedules">勤務表</Link>
      <Link to="/staff">職員管理</Link>
      <span className="spacer" />
      {email && <span style={{ fontSize: 12, color: '#aaa' }}>{email}</span>}
      <button className="logout-btn" onClick={logout}>ログアウト</button>
    </nav>
  )
}

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const token = useStore((s) => s.token)
  if (!token) return <Navigate to="/login" replace />
  return <>{children}</>
}

export default function App() {
  return (
    <BrowserRouter>
      <Nav />
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/register" element={<Register />} />
        <Route
          path="/staff"
          element={
            <ProtectedRoute>
              <StaffList />
            </ProtectedRoute>
          }
        />
        <Route
          path="/schedules"
          element={
            <ProtectedRoute>
              <ScheduleList />
            </ProtectedRoute>
          }
        />
        <Route
          path="/schedules/:id"
          element={
            <ProtectedRoute>
              <ScheduleEditor />
            </ProtectedRoute>
          }
        />
        <Route path="/" element={<Navigate to="/schedules" replace />} />
        <Route path="*" element={<Navigate to="/schedules" replace />} />
      </Routes>
    </BrowserRouter>
  )
}
