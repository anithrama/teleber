import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import { authApi, type User } from '../api/authApi'
import { tokens } from '../api/client'

type AuthContextValue = {
  user: User | null
  loading: boolean
  login: (username: string, password: string) => Promise<void>
  logout: () => void
}

const AuthContext = createContext<AuthContextValue | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let active = true
    const expired = () => {
      if (active) setUser(null)
    }
    window.addEventListener('auth:expired', expired)
    if (!tokens.access()) {
      setLoading(false)
    } else {
      authApi.me().then((currentUser) => {
        if (active) setUser(currentUser)
      }).catch(() => {
        tokens.clear()
        if (active) setUser(null)
      }).finally(() => {
        if (active) setLoading(false)
      })
    }
    return () => {
      active = false
      window.removeEventListener('auth:expired', expired)
    }
  }, [])

  async function login(username: string, password: string) {
    await authApi.login(username, password)
    setUser(await authApi.me())
  }

  function logout() {
    authApi.logout()
    setUser(null)
  }

  return <AuthContext.Provider value={{ user, loading, login, logout }}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const value = useContext(AuthContext)
  if (!value) throw new Error('useAuth must be used inside AuthProvider')
  return value
}