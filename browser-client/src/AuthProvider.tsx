import { useEffect, useState, type ReactNode } from 'react'
import * as api from './api'
import { AuthContext } from './auth'

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<api.User | null>(null)
  const [loading, setLoading] = useState(() => api.getStoredToken() !== null)

  useEffect(() => {
    const token = api.getStoredToken()
    if (!token) {
      return
    }
    api
      .fetchCurrentUser(token)
      .then(setUser)
      .catch(() => api.clearToken())
      .finally(() => setLoading(false))
  }, [])

  const accept = ({ user, token }: { user: api.User; token: string }) => {
    api.storeToken(token)
    setUser(user)
  }

  const signIn = async (name: string, password: string) => accept(await api.login(name, password))
  const signUp = async (name: string, password: string) => accept(await api.register(name, password))

  const signOut = async () => {
    const token = api.getStoredToken()
    api.clearToken()
    setUser(null)
    if (token) {
      await api.logout(token).catch(() => undefined)
    }
  }

  return <AuthContext value={{ user, loading, signIn, signUp, signOut }}>{children}</AuthContext>
}
