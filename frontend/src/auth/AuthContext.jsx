import { useEffect, useState } from 'react'
import { api } from '../lib/api.js'
import { AuthContext } from './context.js'

export function AuthProvider({ children }) {
  const [token, setToken] = useState(() => sessionStorage.getItem('credchain.token'))
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(Boolean(token))

  useEffect(() => {
    if (!token) return

    let active = true
    api('/auth/me', { token })
      .then(({ user: currentUser }) => { if (active) setUser(currentUser) })
      .catch(() => {
        sessionStorage.removeItem('credchain.token')
        if (active) {
          setToken(null)
          setUser(null)
        }
      })
      .finally(() => { if (active) setLoading(false) })

    return () => { active = false }
  }, [token])

  async function signIn(credentials) {
    const session = await api('/auth/login', { method: 'POST', body: JSON.stringify(credentials) })
    sessionStorage.setItem('credchain.token', session.token)
    setToken(session.token)
    setUser(session.user)
    return session.user
  }

  async function register(details) {
    const session = await api('/auth/register', { method: 'POST', body: JSON.stringify(details) })
    sessionStorage.setItem('credchain.token', session.token)
    setToken(session.token)
    setUser(session.user)
    return session.user
  }

  function signOut() {
    sessionStorage.removeItem('credchain.token')
    setToken(null)
    setUser(null)
  }

  return <AuthContext.Provider value={{ token, user, loading, signIn, register, signOut }}>{children}</AuthContext.Provider>
}