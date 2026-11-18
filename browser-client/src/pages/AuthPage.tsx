import { useState } from 'react'
import { Link, Navigate, useLocation } from 'react-router-dom'
import { errorMessage } from '../api'
import { useAuth } from '../auth'

export default function AuthPage({ mode }: { mode: 'login' | 'register' }) {
  const { user, signIn, signUp } = useAuth()
  const location = useLocation()
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const isLogin = mode === 'login'
  const from = (location.state as { from?: string } | null)?.from
  const redirectTo = from ?? '/profile'

  if (user) {
    return <Navigate to={redirectTo} replace />
  }

  const start = async () => {
    setError(null)
    setSubmitting(true)
    try {
      await (isLogin ? signIn : signUp)(redirectTo)
    } catch (err) {
      setError(errorMessage(err))
      setSubmitting(false)
    }
  }

  return (
    <section className="page">
      <h1>{isLogin ? 'Login' : 'Register'}</h1>
      {isLogin && from && <p className="notice">Please log in to continue.</p>}
      {error && <p className="error" role="alert">{error}</p>}
      <button type="button" className="btn" disabled={submitting} onClick={() => void start()}>
        {isLogin ? 'Login with Keycloak' : 'Register with Keycloak'}
      </button>
      <p>
        {isLogin ? (
          <>No account? <Link to="/register" state={{ from }}>Register</Link></>
        ) : (
          <>Already registered? <Link to="/login" state={{ from }}>Login</Link></>
        )}
      </p>
    </section>
  )
}
