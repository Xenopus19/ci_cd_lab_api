import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../auth'

export default function ProfilePage() {
  const { user, signOut } = useAuth()
  const navigate = useNavigate()

  const onLogout = async () => {
    await signOut()
    navigate('/', { replace: true })
  }

  return (
    <section className="page">
      <h1>Hello, {user?.name}!</h1>
      <Link to="/secure" className="btn">Secure messaging</Link>
      <button type="button" className="btn" onClick={onLogout}>Logout</button>
    </section>
  )
}
