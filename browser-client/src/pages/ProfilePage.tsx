import { useState } from 'react'
import { Link } from 'react-router-dom'
import { errorMessage } from '../api'
import { useAuth } from '../auth'

export default function ProfilePage() {
  const { user, signOut } = useAuth()
  const [error, setError] = useState<string | null>(null)

  const onLogout = async () => {
    setError(null)
    try {
      await signOut()
    } catch (err) {
      setError(errorMessage(err))
    }
  }

  return (
    <section className="page">
      <h1>Hello, {user?.name}!</h1>
      {error && <p className="error" role="alert">{error}</p>}
      <Link to="/secure" className="btn">Secure messaging</Link>
      <button type="button" className="btn" onClick={onLogout}>Logout</button>
    </section>
  )
}
