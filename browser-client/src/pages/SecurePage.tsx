import { useCallback, useEffect, useRef, useState, type SyntheticEvent } from 'react'
import { Link } from 'react-router-dom'
import { errorMessage } from '../api'
import { SecureClient, type SessionInfo } from '../secureClient'

export default function SecurePage() {
  const [client] = useState(() => new SecureClient())
  const [message, setMessage] = useState('')
  const [reply, setReply] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [sessionsError, setSessionsError] = useState<string | null>(null)
  const [sessions, setSessions] = useState<SessionInfo[] | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const sending = useRef(false)
  const sessionsRequest = useRef(0)

  const refreshSessions = useCallback(async () => {
    const request = ++sessionsRequest.current
    try {
      const result = await client.listSessions()
      if (request === sessionsRequest.current) {
        setSessions(result)
        setSessionsError(null)
      }
    } catch (err) {
      if (request === sessionsRequest.current) setSessionsError(errorMessage(err))
    }
  }, [client])

  useEffect(() => {
    const counter = sessionsRequest
    const request = ++counter.current
    client.listSessions().then((result) => {
      if (request === counter.current) {
        setSessions(result)
        setSessionsError(null)
      }
    }).catch((err: unknown) => {
      if (request === counter.current) setSessionsError(errorMessage(err))
    })
    return () => { counter.current++ }
  }, [client])

  const onSubmit = async (event: SyntheticEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (sending.current) return
    sending.current = true
    setSubmitting(true)
    setError(null)
    setReply(null)
    try {
      const result = await client.sendMessage(message)
      setReply(result.reply)
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      sending.current = false
      setSubmitting(false)
      void refreshSessions()
    }
  }

  return (
    <section className="page">
      <h1>Secure messaging</h1>
      <Link to="/profile">Back to profile</Link>
      <form className="form" onSubmit={onSubmit}>
        <label>
          Message
          <textarea value={message} onChange={(event) => setMessage(event.target.value)} required rows={4} />
        </label>
        {error && <p className="error" role="alert">{error}</p>}
        <button type="submit" className="btn" disabled={submitting}>
          {submitting ? 'Sending…' : 'Send message'}
        </button>
      </form>
      {reply !== null && <div className="secure-result"><h2>Decrypted response</h2><pre>{reply}</pre></div>}
      <div className="secure-result">
        <h2>Cryptographic sessions</h2>
        <button type="button" className="btn" onClick={() => void refreshSessions()}>Refresh sessions</button>
        {sessionsError && <p className="error" role="alert">{sessionsError}</p>}
        {sessions === null ? !sessionsError && <p>Loading sessions…</p> : sessions.length === 0 ? <p>No sessions yet.</p> : (
          <ul className="session-list">
            {sessions.map((session) => (
              <li key={session.sessionId}>
                <strong>{session.expired ? 'Expired' : 'Active'}</strong>
                <div>{session.sessionId}</div>
                <div>Expires: {new Date(session.expiresAt).toLocaleString()}</div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  )
}
