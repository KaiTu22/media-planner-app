import { useEffect, useState } from 'react';
import { appsScriptPost, jsonpRequest, verifyByPolling } from '../../api/appsScript';
import { SANDBOX_API_URL } from '../../api/config';

// Sponsorship Hub (in progress) — a managed list backing the Hub's
// Season/Year selector when building a catalog package. A single flexible
// label rather than separate structured year/season fields, since it needs
// to hold both "Season 51" and "2027" depending on the show. Same id+name
// shape, and same rename/delete/central-management pattern, as Shows /
// Franchises (formerly Tentpole Shows).
export default function SeasonYearSettings() {
  const [seasonYears, setSeasonYears] = useState([]);
  const [status, setStatus] = useState('loading');
  const [error, setError] = useState(null);
  const [newLabel, setNewLabel] = useState('');

  const refresh = () => {
    setStatus('loading');
    jsonpRequest(SANDBOX_API_URL, { action: 'listSeasonYears' })
      .then((rows) => { setSeasonYears(rows); setStatus('done'); })
      .catch((err) => { setError(err.message); setStatus('error'); });
  };

  useEffect(refresh, []);

  const createSeasonYear = async () => {
    const name = newLabel.trim();
    if (!name) return;
    const id = `season-year-${Date.now()}`;
    setSeasonYears((prev) => [...prev, { id, name }]);
    try {
      await appsScriptPost(SANDBOX_API_URL, { action: 'createSeasonYear', payload: JSON.stringify({ id, name }) });
      await verifyByPolling(async () => {
        const rows = await jsonpRequest(SANDBOX_API_URL, { action: 'listSeasonYears' });
        return rows.some((s) => s.id === id);
      });
      setNewLabel('');
    } catch (err) {
      setSeasonYears((prev) => prev.filter((s) => s.id !== id));
      window.alert(`Could not add season/year: ${err.message}`);
    }
  };

  const renameSeasonYear = async (seasonYear, name) => {
    const previous = seasonYears;
    setSeasonYears((prev) => prev.map((s) => (s.id === seasonYear.id ? { ...s, name } : s)));
    try {
      await appsScriptPost(SANDBOX_API_URL, { action: 'updateSeasonYear', payload: JSON.stringify({ id: seasonYear.id, name }) });
      await verifyByPolling(async () => {
        const rows = await jsonpRequest(SANDBOX_API_URL, { action: 'listSeasonYears' });
        return rows.find((s) => s.id === seasonYear.id)?.name === name;
      });
    } catch (err) {
      setSeasonYears(previous);
      window.alert(`Could not rename season/year: ${err.message}`);
    }
  };

  const deleteSeasonYear = async (seasonYear) => {
    if (!window.confirm(`Delete "${seasonYear.name}"?`)) return;
    const previous = seasonYears;
    setSeasonYears((prev) => prev.filter((s) => s.id !== seasonYear.id));
    try {
      await appsScriptPost(SANDBOX_API_URL, { action: 'deleteSeasonYear', payload: JSON.stringify({ id: seasonYear.id }) });
      await verifyByPolling(async () => {
        const rows = await jsonpRequest(SANDBOX_API_URL, { action: 'listSeasonYears' });
        return !rows.some((s) => s.id === seasonYear.id);
      });
    } catch (err) {
      setSeasonYears(previous);
      window.alert(`Could not delete season/year: ${err.message}`);
    }
  };

  if (status === 'loading') return <p>Loading seasons/years…</p>;
  if (status === 'error') return <p style={{ color: 'crimson' }}>Failed: {error}</p>;

  return (
    <div>
      <h2>Season / Year</h2>
      <p style={{ color: 'var(--text-muted)', maxWidth: 560 }}>
        Backs the Sponsorship Hub's Season/Year selector when building a catalog package — a single flexible label (e.g. "Season 51" or "2027") rather than separate year/season fields, so it fits whichever way a given show tracks its own seasons.
      </p>

      <div className="table-scroll" style={{ maxWidth: 560, marginTop: 16 }}>
        <table>
          <thead>
            <tr><th>Season / Year</th><th></th></tr>
          </thead>
          <tbody>
            {seasonYears.map((s) => (
              <tr key={s.id}>
                <td>
                  <input
                    defaultValue={s.name}
                    onBlur={(e) => { const v = e.target.value.trim(); if (v && v !== s.name) renameSeasonYear(s, v); }}
                    style={{ width: 260 }}
                  />
                </td>
                <td><button className="btn-link" onClick={() => deleteSeasonYear(s)}>Delete</button></td>
              </tr>
            ))}
            {seasonYears.length === 0 && (
              <tr><td colSpan={2} style={{ color: 'var(--text-muted)' }}>No seasons/years yet.</td></tr>
            )}
          </tbody>
        </table>
      </div>

      <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 16 }}>
        <input value={newLabel} onChange={(e) => setNewLabel(e.target.value)} placeholder="e.g. Season 51, or 2027" style={{ width: 260 }} />
        <button onClick={createSeasonYear}>Add season/year</button>
      </div>
    </div>
  );
}
