import axios, { AxiosError, type AxiosAdapter, type AxiosResponse, type InternalAxiosRequestConfig } from 'axios'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ExchangePanel } from '../src/ExchangePanel'
import { clearExchanges, getExchanges } from '../src/exchangeLog'
import { createApiClient } from '../src/http'
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
    clearExchanges()
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

  it('records requests in send order even when responses complete out of order', async () => {
    const pending: Array<{ config: InternalAxiosRequestConfig; resolve: (response: AxiosResponse) => void }> = []
    axios.defaults.adapter = (config) => new Promise((resolve) => { pending.push({ config, resolve }) })
    const client = createApiClient('https://api.example.test', async () => 'token')
    const first = client.post('/api/first', { value: 'hello' })
    const second = client.get('/api/second')
    await vi.waitFor(() => expect(pending).toHaveLength(2))
    expect(getExchanges().map((entry) => entry.url)).toEqual([
      'https://api.example.test/api/first', 'https://api.example.test/api/second',
    ])
    pending[1].resolve({ config: pending[1].config, status: 201, statusText: 'Created', headers: { 'x-visible': 'yes' }, data: 'second' })
    await second
    expect(getExchanges()[0].response).toBeUndefined()
    pending[0].resolve({ config: pending[0].config, status: 200, statusText: 'OK', headers: {}, data: '{"ok":true}' })
    await first
    expect(getExchanges()[0]).toMatchObject({
      method: 'POST', body: '{"value":"hello"}',
      response: { status: 200, body: '{"ok":true}' },
    })
    expect(getExchanges()[0].headers).toContain('Content-Type: application/json')
    expect(getExchanges()[1].response?.headers).toContain('x-visible: yes')
    const panel = renderToStaticMarkup(createElement(ExchangePanel))
    expect(panel).toContain('POST https://api.example.test/api/first')
    expect(panel).toContain('Duration:')
    expect(panel).toContain('x-visible: yes')
    expect(panel).toContain('&quot;value&quot;:&quot;hello&quot;')
  })

  it('masks bearer tokens and key values in logged headers and nested JSON without changing the exchange', async () => {
    let sent: InternalAxiosRequestConfig | undefined
    const responseBody = {
      token: 'local-token', publicKey: 'public-value',
      nested: [{ private_key: 'private-value', sessionKey: 'session-value', symmetricKey: 'symmetric-value', key: 'raw-key', ciphertext: 'encrypted-message' }],
    }
    axios.defaults.adapter = async (config) => {
      sent = config
      return {
        config, status: 200, statusText: 'OK',
        headers: { 'x-access-token': 'header-token', 'x-visible': 'visible' },
        data: JSON.stringify(responseBody),
      }
    }
    const client = createApiClient('https://api.example.test', async () => 'realm-token')
    const response = await client.post('/api/secure/session', {
      encryptedKey: 'wrapped-key', items: [{ aes_key: 'aes-value', secretKey: 'secret-value' }],
    }, { headers: { 'X-Local-Authorization': 'bearer local-token' } })

    expect(sent?.headers.get('Authorization')).toBe('Bearer realm-token')
    expect(JSON.parse(sent!.data)).toMatchObject({ encryptedKey: 'wrapped-key' })
    expect(response.data).toEqual(responseBody)
    const entry = getExchanges()[0]
    expect(entry.headers).toContain('Authorization: Bearer [hidden]')
    expect(entry.headers).toContain('X-Local-Authorization: Bearer [hidden]')
    expect(JSON.parse(entry.body!)).toEqual({
      encryptedKey: '[hidden]', items: [{ aes_key: '[hidden]', secretKey: '[hidden]' }],
    })
    expect(entry.response?.headers).toContain('x-access-token: [hidden]')
    expect(JSON.parse(entry.response!.body!)).toEqual({
      token: '[hidden]', publicKey: 'public-value',
      nested: [{ private_key: '[hidden]', sessionKey: '[hidden]', symmetricKey: '[hidden]', key: '[hidden]', ciphertext: 'encrypted-message' }],
    })
    const panel = renderToStaticMarkup(createElement(ExchangePanel))
    for (const secret of ['realm-token', 'local-token', 'header-token', 'wrapped-key', 'private-value', 'session-value', 'symmetric-value', 'raw-key', 'aes-value', 'secret-value']) {
      expect(panel).not.toContain(secret)
    }
    expect(panel).toContain('encrypted-message')
  })

  it('does not restore an in-flight exchange after clearing the log', async () => {
    let complete: ((response: AxiosResponse) => void) | undefined
    let requestConfig: InternalAxiosRequestConfig | undefined
    axios.defaults.adapter = (config) => new Promise((resolve) => {
      requestConfig = config
      complete = resolve
    })
    const client = createApiClient('https://api.example.test', async () => 'token')
    const request = client.get('/api/pending')
    await vi.waitFor(() => expect(complete).toBeDefined())
    clearExchanges()
    complete!({ config: requestConfig!, status: 200, statusText: 'OK', headers: {}, data: '' })
    await request
    expect(getExchanges()).toEqual([])
  })

  it('records HTTP errors and network failures without changing the errors', async () => {
    axios.defaults.adapter = async (config) => {
      if (config.url === '/api/http-error') {
        throw new AxiosError('Expired', 'ERR_BAD_REQUEST', config, undefined, {
          config, status: 440, statusText: 'Expired', headers: { 'x-error': 'expired' }, data: '{"error":"Session expired.","privateKey":"private-error"}',
        })
      }
      throw new AxiosError('Network Error', 'ERR_NETWORK', config)
    }
    const client = createApiClient('https://api.example.test', async () => 'token')
    await expect(client.get('/api/http-error')).rejects.toMatchObject({ response: { status: 440 } })
    await expect(client.get('/api/network-error')).rejects.toThrow('Network Error')
    expect(getExchanges()[0].response).toMatchObject({ status: 440, body: '{"error":"Session expired.","privateKey":"[hidden]"}' })
    expect(getExchanges()[1]).toMatchObject({ error: 'Network Error' })
    expect(getExchanges()[1].response).toBeUndefined()
  })
})
