import { useEffect, useState } from 'react';
import { appsScriptPost, jsonpRequest } from '../api/appsScript';
import { CLOSED_DEALS_API_URL } from '../api/config';

// Proves the real app (not just a DevTools console) can call the
// DOMAIN-restricted Apps Script backend across origins — reads via JSONP,
// writes via hidden iframe + form POST (see api/appsScript.js).
export default function BackendCheck() {
  const [status, setStatus] = useState('loading');
  const [deals, setDeals] = useState([]);
  const [error, setError] = useState(null);
  const [writeResult, setWriteResult] = useState(null);
  const [writeError, setWriteError] = useState(null);
  const [writing, setWriting] = useState(false);

  useEffect(() => {
    jsonpRequest(CLOSED_DEALS_API_URL)
      .then((rows) => {
        setDeals(rows);
        setStatus('done');
      })
      .catch((err) => {
        setError(err.message);
        setStatus('error');
      });
  }, []);

  const runWriteTest = async () => {
    setWriting(true);
    setWriteResult(null);
    setWriteError(null);
    const note = `write test from React app at ${new Date().toISOString()}`;
    try {
      await appsScriptPost(CLOSED_DEALS_API_URL, { note });
      const rows = await jsonpRequest(CLOSED_DEALS_API_URL, { action: 'listWriteTest' });
      const lastRow = rows[rows.length - 1];
      if (lastRow && lastRow[2] === note) {
        setWriteResult({ by: lastRow[1], note: lastRow[2] });
      } else {
        setWriteError('Write did not appear in a follow-up read — check the sheet directly.');
      }
    } catch (err) {
      setWriteError(err.message);
    } finally {
      setWriting(false);
    }
  };

  if (status === 'loading') return <p>Loading closed deals from Apps Script…</p>;
  if (status === 'error') return <p style={{ color: 'crimson' }}>Failed: {error}</p>;

  return (
    <div>
      <h2>Backend connectivity check</h2>
      <p>{deals.length} deals loaded from the Sheets/Apps Script pilot backend.</p>
      <ul>
        {deals.map((d) => (
          <li key={d.id}>{d.project_name} — {d.brand_name}</li>
        ))}
      </ul>

      <h3>Write-path check</h3>
      <button onClick={runWriteTest} disabled={writing}>
        {writing ? 'Sending…' : 'Send test write'}
      </button>
      {writeResult && (
        <p style={{ color: 'green' }}>
          Wrote row as {writeResult.by}: "{writeResult.note}"
        </p>
      )}
      {writeError && <p style={{ color: 'crimson' }}>Failed: {writeError}</p>}
    </div>
  );
}
