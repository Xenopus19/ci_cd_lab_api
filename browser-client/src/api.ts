import axios from 'axios'
import { createApiClient } from './http'

export interface User {
  id: string
  name: string
}

interface AuthResponse {
  user: User
  token: string
}

const TOKEN_KEY = 'auth_token'

export const getStoredToken = (): string | null => localStorage.getItem(TOKEN_KEY)
export const storeToken = (token: string): void => localStorage.setItem(TOKEN_KEY, token)
export const clearToken = (): void => localStorage.removeItem(TOKEN_KEY)

const http = createApiClient()

export async function register(name: string, password: string): Promise<AuthResponse> {
  return (await http.post<AuthResponse>('/api/auth/register', { name, password })).data
}

export async function login(name: string, password: string): Promise<AuthResponse> {
  return (await http.post<AuthResponse>('/api/auth/login', { name, password })).data
}

export async function fetchCurrentUser(token: string): Promise<User> {
  return (await http.get<User>('/api/auth/me', { headers: { 'X-Local-Authorization': `Bearer ${token}` } })).data
}

export async function logout(token: string): Promise<void> {
  await http.post('/api/auth/logout', null, { headers: { 'X-Local-Authorization': `Bearer ${token}` } })
}

export function errorMessage(error: unknown): string {
  if (axios.isAxiosError(error)) {
    return error.response?.data?.error ?? (error.response ? `Request failed (${error.response.status}).` : 'Could not reach the server.')
  }
  return error instanceof Error ? error.message : 'Something went wrong.'
}
