import axios from 'axios'

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

const http = axios.create({ baseURL: '/api/auth' })

const authHeaders = (token: string) => ({ headers: { Authorization: `Bearer ${token}` } })

export async function register(name: string, password: string): Promise<AuthResponse> {
  return (await http.post<AuthResponse>('/register', { name, password })).data
}

export async function login(name: string, password: string): Promise<AuthResponse> {
  return (await http.post<AuthResponse>('/login', { name, password })).data
}

export async function fetchCurrentUser(token: string): Promise<User> {
  return (await http.get<User>('/me', authHeaders(token))).data
}

export async function logout(token: string): Promise<void> {
  await http.post('/logout', null, authHeaders(token))
}

export function errorMessage(error: unknown): string {
  if (axios.isAxiosError(error)) {
    return error.response?.data?.error ?? (error.response ? `Request failed (${error.response.status}).` : 'Could not reach the server.')
  }
  return error instanceof Error ? error.message : 'Something went wrong.'
}
