import { Navigate } from 'react-router-dom'
import { useAuth } from './useAuth.js'

export function RequireAuth({ roles, children }) {
  const { user, loading } = useAuth()
  if (loading) return <main className="app-state"><span className="loading-mark" /><p>Restoring your secure session…</p></main>
  if (!user) return <Navigate to="/login" replace />
  if (roles && !roles.includes(user.role)) return <Navigate to={user.role === 'STUDENT' ? '/student' : '/issuer'} replace />
  return children
}