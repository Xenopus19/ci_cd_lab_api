import { Link } from 'react-router-dom'

export default function HomePage() {
  return (
    <section className="page">
      <h1>Welcome</h1>
      <p>Create an account or log in to see your profile.</p>
      <div className="actions">
        <Link to="/register" className="btn">Register</Link>
        <Link to="/login" className="btn">Login</Link>
      </div>
    </section>
  )
}
