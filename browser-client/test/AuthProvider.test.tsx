import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import { AuthProvider } from '../src/AuthProvider'
import { useAuth } from '../src/auth'
import { keycloak } from '../src/utils/keycloak'

vi.mock('../src/utils/keycloak', () => ({
  keycloak: {
    authenticated: true,
    idTokenParsed: { preferred_username: 'id-user' },
    tokenParsed: { preferred_username: 'access-user' },
  },
}))

function Username() {
  return <span>{useAuth().user?.name}</span>
}

describe('AuthProvider', () => {
  it('uses the ID token rather than the access token for the username', () => {
    expect(renderToStaticMarkup(<AuthProvider><Username /></AuthProvider>)).toBe('<span>id-user</span>')
    delete keycloak.idTokenParsed
    expect(renderToStaticMarkup(<AuthProvider><Username /></AuthProvider>)).toBe('<span>User</span>')
  })
})
