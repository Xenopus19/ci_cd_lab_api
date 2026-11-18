import axios, { type AxiosInstance } from 'axios'
import { createApiClient } from './http'

interface Session {
  id: string
  rsaId: number
  key: CryptoKey
}

export interface SessionInfo {
  sessionId: string
  expiresAt: string
  expired: boolean
}

const encoder = new TextEncoder()
const decoder = new TextDecoder()

function toBase64(bytes: Uint8Array): string {
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary)
}

function fromBase64(value: string): Uint8Array<ArrayBuffer> {
  const binary = atob(value)
  return Uint8Array.from(binary, (char) => char.charCodeAt(0))
}

export class SecureClient {
  private session: Session | undefined
  private readonly http: AxiosInstance

  constructor(baseURL?: string, getToken?: () => Promise<string>) {
    this.http = createApiClient(baseURL, getToken)
  }

  async listSessions(): Promise<SessionInfo[]> {
    return (await this.http.get<SessionInfo[]>('/api/sessions')).data
  }

  private async createSession(): Promise<Session> {
    if (!globalThis.crypto?.subtle) {
      throw new Error('Secure messaging requires HTTPS or localhost with Web Crypto support.')
    }

    const { id: rsaId } = (await this.http.post<{ id: number }>('/api/crypto-keys/generate/rsa-keys')).data
    const { publicKey } = (await this.http.get<{ publicKey: string }>(`/api/crypto-keys/rsa-public-key/${rsaId}`)).data
    const pem = publicKey.replace(/-----BEGIN PUBLIC KEY-----|-----END PUBLIC KEY-----|\s/g, '')
    const rsaKey = await crypto.subtle.importKey(
      'spki', fromBase64(pem), { name: 'RSA-OAEP', hash: 'SHA-256' }, false, ['encrypt'],
    )
    const keyBytes = crypto.getRandomValues(new Uint8Array(32))
    const key = await crypto.subtle.importKey('raw', keyBytes, 'AES-GCM', false, ['encrypt', 'decrypt'])
    const encryptedKey = await crypto.subtle.encrypt({ name: 'RSA-OAEP' }, rsaKey, encoder.encode(toBase64(keyBytes)))
    const id = crypto.randomUUID()
    await this.http.post('/api/secure/session', { encryptedKey: toBase64(new Uint8Array(encryptedKey)) }, {
      headers: { 'x-rsa-id': String(rsaId), 'x-session-id': id },
    })
    return { id, rsaId, key }
  }

  private async sendWithSession(session: Session, message: string): Promise<string> {
    const plaintext = encoder.encode(message)
    const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', plaintext))
    const hash = Array.from(digest, (byte) => byte.toString(16).padStart(2, '0')).join('')
    const iv = crypto.getRandomValues(new Uint8Array(12))
    const encrypted = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, session.key, plaintext))
    const payload = new Uint8Array(iv.length + encrypted.length)
    payload.set(iv)
    payload.set(encrypted.subarray(encrypted.length - 16), iv.length)
    payload.set(encrypted.subarray(0, encrypted.length - 16), iv.length + 16)

    const { ciphertext } = (await this.http.post<{ ciphertext: string }>('/api/secure/message', {
      ciphertext: toBase64(payload), hash,
    }, { headers: { 'x-session-id': session.id } })).data
    const response = fromBase64(ciphertext)
    if (response.length < 28) throw new Error('Ciphertext is too short.')
    const encryptedReply = new Uint8Array(response.length - 12)
    encryptedReply.set(response.subarray(28))
    encryptedReply.set(response.subarray(12, 28), response.length - 28)
    const reply = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: response.subarray(0, 12) }, session.key, encryptedReply,
    )
    return decoder.decode(reply)
  }

  async sendMessage(message: string): Promise<{ sessionId: string; rsaId: number; reply: string }> {
    let session = this.session ?? await this.createSession()
    this.session = session
    let reply: string
    try {
      reply = await this.sendWithSession(session, message)
    } catch (error: unknown) {
      if (!axios.isAxiosError(error) || error.response?.status !== 440 ||
        error.response.data?.error !== 'Session expired.') throw error
      this.session = undefined
      session = await this.createSession()
      this.session = session
      try {
        reply = await this.sendWithSession(session, message)
      } catch (retryError: unknown) {
        this.session = undefined
        throw retryError
      }
    }
    return { sessionId: session.id, rsaId: session.rsaId, reply }
  }
}
