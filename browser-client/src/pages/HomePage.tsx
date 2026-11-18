import { Link } from 'react-router-dom'
import { useState } from 'react'
import { errorMessage } from '../api'
import { useAuth } from '../auth'

export default function HomePage() {
  const { user, signIn, signUp } = useAuth()
  const [error, setError] = useState<string | null>(null)

  const start = async (action: () => Promise<void>) => {
    setError(null)
    try {
      await action()
    } catch (err) {
      setError(errorMessage(err))
    }
  }

  return (
    <section className="page">
      <h1>Welcome</h1>
      <p role="status">Keycloak status: {user ? `Authenticated as ${user.name}` : 'Guest'}</p>
      {error && <p className="error" role="alert">{error}</p>}
      <div className="actions">
        {user ? <Link to="/profile" className="btn">Profile</Link> : (
          <>
            <button type="button" className="btn" onClick={() => void start(signUp)}>Register</button>
            <button type="button" className="btn" onClick={() => void start(signIn)}>Login</button>
          </>
        )}
      </div>
    </section>
  )
}
