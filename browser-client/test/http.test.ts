import axios, { type AxiosAdapter, type InternalAxiosRequestConfig } from 'axios'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { keycloak } from '../src/utils/keycloak'

vi.mock('../src/utils/keycloak', () => ({
  keycloak: { token: undefined, updateToken: vi.fn() },
}))

describe('SPA API client', () => {
  const originalAdapter = axios.defaults.adapter

  afterEach(() => {
    if (originalAdapter === undefined) delete axios.defaults.adapter
    else axios.defaults.adapter = originalAdapter
    vi.resetAllMocks()
    delete keycloak.token
  })

  it('refreshes the access token, preserves local authorization, and surfaces refresh failures', async () => {
    const requests: InternalAxiosRequestConfig[] = []
    let tokenNumber = 0
    vi.mocked(keycloak.updateToken).mockImplementation(async () => {
      keycloak.token = `access-${++tokenNumber}`
      return true
    })
    const adapter = vi.fn<AxiosAdapter>(async (config) => {
      requests.push(config)
      return { data: {}, status: 200, statusText: 'OK', headers: {}, config }
    })
    axios.defaults.adapter = adapter
    const { fetchCurrentUser, login, logout, register } = await import('../src/api')

    await register('name', 'password')
    await login('name', 'password')
    await fetchCurrentUser('local-token')
    await logout('local-token')

    expect(keycloak.updateToken).toHaveBeenCalledTimes(4)
    expect(keycloak.updateToken).toHaveBeenCalledWith(30)
    expect(requests.map((request) => request.headers.get('Authorization'))).toEqual([
      'Bearer access-1', 'Bearer access-2', 'Bearer access-3', 'Bearer access-4',
    ])
    expect(requests.map((request) => request.headers.get('X-Local-Authorization'))).toEqual([
      undefined, undefined, 'Bearer local-token', 'Bearer local-token',
    ])
    adapter.mockClear()
    delete keycloak.token
    vi.mocked(keycloak.updateToken).mockRejectedValueOnce(new Error('Refresh failed'))
      .mockResolvedValueOnce(false)

    await expect(login('name', 'password')).rejects.toThrow('Refresh failed')
    await expect(login('name', 'password')).rejects.toThrow('Authentication required.')
    expect(adapter).not.toHaveBeenCalled()
  })
})
