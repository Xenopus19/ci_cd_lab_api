import axios, { type AxiosInstance } from 'axios'
import { recordingAdapter } from './exchangeLog'
import { keycloak } from './utils/keycloak'

async function getAccessToken(): Promise<string> {
  await keycloak.updateToken(30)
  if (!keycloak.token) throw new Error('Authentication required.')
  return keycloak.token
}

export function createApiClient(
  baseURL = import.meta.env.VITE_API_URL || '',
  getToken: () => Promise<string> = getAccessToken,
): AxiosInstance {
  const http = axios.create({ baseURL })
  const adapter = axios.getAdapter(http.defaults.adapter)
  http.defaults.adapter = recordingAdapter(adapter, (config) => http.getUri(config))
  http.interceptors.request.use(async (config) => {
    config.headers.set('Authorization', `Bearer ${await getToken()}`)
    return config
  })
  return http
}
