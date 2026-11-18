import type { ReactNode } from 'react'
import { AuthContext } from './auth'
import { keycloak } from './utils/keycloak'

export function AuthProvider({ children }: { children: ReactNode }) {
  const claims = keycloak.idTokenParsed ?? keycloak.tokenParsed
  const user = keycloak.authenticated
    ? { name: claims?.preferred_username ?? claims?.name ?? keycloak.subject ?? 'User' }
    : null

  const redirectUri = (path = '/profile') => `${window.location.origin}${path}`
  const signIn = (path?: string) => keycloak.login({ redirectUri: redirectUri(path) })
  const signUp = (path?: string) => keycloak.register({ redirectUri: redirectUri(path) })
  const signOut = () => keycloak.logout({ redirectUri: redirectUri('/') })

  return <AuthContext value={{ user, signIn, signUp, signOut }}>{children}</AuthContext>
}
