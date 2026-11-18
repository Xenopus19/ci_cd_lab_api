import { useSyncExternalStore } from 'react'
import { clearExchanges, getExchanges, subscribeExchanges } from './exchangeLog'

export function ExchangePanel() {
  const exchanges = useSyncExternalStore(subscribeExchanges, getExchanges, getExchanges)

  return (
    <section className="exchange-panel" aria-label="HTTP exchanges">
      <h2>HTTP exchanges</h2>
      <p>API requests in sending order. Headers and bodies may contain sensitive information.</p>
      <button type="button" className="btn" onClick={clearExchanges} disabled={exchanges.length === 0}>Clear exchanges</button>
      {exchanges.length === 0 ? <p>No API requests yet.</p> : (
        <ol className="exchange-list">
          {exchanges.map((exchange) => (
            <li key={exchange.id}>
              <details>
                <summary>{exchange.method} {exchange.url} — {exchange.response ? exchange.response.status : exchange.error ? 'Failed' : 'Pending'}</summary>
                <h3>Request</h3>
                <div><strong>Method:</strong> {exchange.method}</div>
                <div><strong>URL:</strong> {exchange.url}</div>
                <h4>Headers</h4>
                <pre>{exchange.headers || '(none)'}</pre>
                {exchange.body !== undefined && <><h4>Body</h4><pre>{exchange.body}</pre></>}
                <h3>Response</h3>
                {exchange.response ? (
                  <>
                    <div><strong>Status:</strong> {exchange.response.status}</div>
                    <div><strong>Duration:</strong> {exchange.response.duration.toFixed(1)} ms</div>
                    <h4>Headers available to the browser</h4>
                    <pre>{exchange.response.headers || '(none)'}</pre>
                    {exchange.response.body !== undefined && <><h4>Body</h4><pre>{exchange.response.body}</pre></>}
                  </>
                ) : <p>{exchange.error ? `Request failed: ${exchange.error}` : 'Waiting for response…'}</p>}
              </details>
            </li>
          ))}
        </ol>
      )}
    </section>
  )
}
