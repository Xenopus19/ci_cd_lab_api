import axios, { type AxiosAdapter, type AxiosResponse, type InternalAxiosRequestConfig } from 'axios'

interface ExchangeResponse {
  status: number
  duration: number
  headers: string
  body?: string
}

export interface Exchange {
  id: number
  method: string
  url: string
  headers: string
  body?: string
  response?: ExchangeResponse
  error?: string
}

let exchanges: Exchange[] = []
let nextId = 0
const listeners = new Set<() => void>()

function publish(next: Exchange[]) {
  exchanges = next
  listeners.forEach((listener) => listener())
}

export function subscribeExchanges(listener: () => void) {
  listeners.add(listener)
  return () => { listeners.delete(listener) }
}

export function getExchanges() {
  return exchanges
}

export function clearExchanges() {
  publish([])
}

function sensitiveName(name: string): boolean {
  const normalized = name.toLowerCase().replace(/[-_\s]/g, '')
  return normalized.endsWith('token') || normalized === 'key' || normalized === 'keybytes' ||
    /(?:private|symmetric|secret|aes|session|encryption)key(?:bytes|pem)?$/.test(normalized) ||
    normalized === 'encryptedkey'
}

function redactText(value: string): string {
  return value
    .replace(/\bBearer\s+[^\s,;"']+/gi, 'Bearer [hidden]')
    .replace(/-----BEGIN (?:[A-Z0-9]+ )*PRIVATE KEY-----[\s\S]*?-----END (?:[A-Z0-9]+ )*PRIVATE KEY-----/g, '[hidden]')
}

function formatHeaders(headers: AxiosResponse['headers'] | InternalAxiosRequestConfig['headers']): string {
  return Object.entries(headers)
    .filter(([, value]) => value !== undefined && value !== null && value !== false)
    .map(([name, value]) => `${name}: ${sensitiveName(name) ? '[hidden]' : redactText(String(value))}`).join('\n')
}

function formatBody(body: unknown): string | undefined {
  if (body === undefined || body === null || body === '') return undefined
  let value: unknown = body
  if (typeof body === 'string') {
    try {
      value = JSON.parse(body) as unknown
    } catch (error: unknown) {
      if (!(error instanceof SyntaxError)) throw error
      return redactText(body)
    }
  }
  return JSON.stringify(value, (name: string, entry: unknown) => {
    if (name && sensitiveName(name)) return '[hidden]'
    return typeof entry === 'string' ? redactText(entry) : entry
  })
}

export function recordingAdapter(adapter: AxiosAdapter, getUrl: (config: Parameters<AxiosAdapter>[0]) => string): AxiosAdapter {
  return async (config) => {
    const id = ++nextId
    const started = performance.now()
    const url = getUrl(config)
    const exchange: Exchange = {
      id,
      method: (config.method ?? 'get').toUpperCase(),
      url: typeof window === 'undefined' ? url : new URL(url, window.location.href).href,
      headers: formatHeaders(config.headers),
      body: formatBody(config.data),
    }
    publish([...exchanges, exchange])

    const finish = (response?: AxiosResponse, error?: string) => {
      const duration = performance.now() - started
      publish(exchanges.map((item) => item.id !== id ? item : {
        ...item,
        response: response && {
          status: response.status,
          duration,
          headers: formatHeaders(response.headers),
          body: formatBody(response.data),
        },
        error,
      }))
    }

    try {
      const response = await adapter(config)
      finish(response)
      return response
    } catch (error: unknown) {
      const response = axios.isAxiosError(error) ? error.response : undefined
      finish(response, response ? undefined : redactText(error instanceof Error ? error.message : String(error)))
      throw error
    }
  }
}
