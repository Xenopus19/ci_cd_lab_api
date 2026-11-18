import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import './index.css'
import App from './App.tsx'
import { AuthProvider } from './AuthProvider.tsx'
import { initKeycloak } from './utils/keycloak'

const rootElement = document.getElementById('root')
if (!rootElement) {
  throw new Error('Root element not found')
}

const root = createRoot(rootElement)

async function bootstrap() {
  try {
    await initKeycloak()
    root.render(
      <StrictMode>
        <BrowserRouter>
          <AuthProvider>
            <App />
          </AuthProvider>
        </BrowserRouter>
      </StrictMode>,
    )
  } catch (error) {
    console.error('Failed to initialize Keycloak', error)
    const message = error instanceof Error ? error.message : String(error)
    root.render(<p role="alert">Failed to initialize Keycloak: {message}</p>)
  }
}

void bootstrap()
