import { useEffect, useState } from 'react';
import { appsScriptPost, jsonpRequest, verifyByPolling } from '../../api/appsScript';
import { SANDBOX_API_URL } from '../../api/config';

// Tentpole Shows (confirmed 2026-09-16) — sub-categories under the
// "Show / Tentpole" deal category, so specific tentpole events can be
// tracked individually rather than lumped into one "tentpole" bucket. The
// Assignment form's Tentpole Show dropdown already reads this same list and
// can add to it inline (a convenience during Assignment creation) — this
// page adds the rename/delete/central-management half that was missing,
// same gap Agency/Hold Co and Pitch Lead/Pitch Team had before their
// settings pages existed. Keyed on a synthetic id (like Tags), so renaming
// never needs an old/new-key distinction.
export default function TentpoleShowSettings() {
  const [shows, setShows] = useState([]);
  const [status, setStatus] = useState('loading');
  const [error, setError] = useState(null);
  const [newShowName, setNewShowName] = useState('');

  const refresh = () => {
    setStatus('loading');
    jsonpRequest(SANDBOX_API_URL, { action: 'listTentpoleShows' })
      .then((rows) => { setShows(rows); setStatus('done'); })
      .catch((err) => { setError(err.message); setStatus('error'); });
  };

  useEffect(refresh, []);

  const createShow = async () => {
    const name = newShowName.trim();
    if (!name) return;
    const id = `show-${Date.now()}`;
    setShows((prev) => [...prev, { id, name }]);
    try {
      await appsScriptPost(SANDBOX_API_URL, { action: 'createTentpoleShow', payload: JSON.stringify({ id, name }) });
      await verifyByPolling(async () => {
        const rows = await jsonpRequest(SANDBOX_API_URL, { action: 'listTentpoleShows' });
        return rows.some((s) => s.id === id);
      });
      setNewShowName('');
    } catch (err) {
      setShows((prev) => prev.filter((s) => s.id !== id));
      window.alert(`Could not add tentpole show: ${err.message}`);
    }
  };

  const renameShow = async (show, name) => {
    const previous = shows;
    setShows((prev) => prev.map((s) => (s.id === show.id ? { ...s, name } : s)));
    try {
      await appsScriptPost(SANDBOX_API_URL, { action: 'updateTentpoleShow', payload: JSON.stringify({ id: show.id, name }) });
      await verifyByPolling(async () => {
        const rows = await jsonpRequest(SANDBOX_API_URL, { action: 'listTentpoleShows' });
        return rows.find((s) => s.id === show.id)?.name === name;
      });
    } catch (err) {
      setShows(previous);
      window.alert(`Could not rename tentpole show: ${err.message}`);
    }
  };

  const deleteShow = async (show) => {
    if (!window.confirm(`Delete "${show.name}"? Any project currently set to this show keeps its Deal Category but loses this specific show.`)) return;
    const previous = shows;
    setShows((prev) => prev.filter((s) => s.id !== show.id));
    try {
      await appsScriptPost(SANDBOX_API_URL, { action: 'deleteTentpoleShow', payload: JSON.stringify({ id: show.id }) });
      await verifyByPolling(async () => {
        const rows = await jsonpRequest(SANDBOX_API_URL, { action: 'listTentpoleShows' });
        return !rows.some((s) => s.id === show.id);
      });
    } catch (err) {
      setShows(previous);
      window.alert(`Could not delete tentpole show: ${err.message}`);
    }
  };

  if (status === 'loading') return <p>Loading tentpole shows…</p>;
  if (status === 'error') return <p style={{ color: 'crimson' }}>Failed: {error}</p>;

  return (
    <div>
      <h2>Tentpole Shows</h2>
      <p style={{ color: 'var(--text-muted)', maxWidth: 560 }}>
        Sub-categories for the "Show / Tentpole" Deal Category — backs the Assignment form's Tentpole Show dropdown, so specific events can be tracked and reported on individually.
      </p>

      <div className="table-scroll" style={{ maxWidth: 560, marginTop: 16 }}>
        <table>
          <thead>
            <tr><th>Show</th><th></th></tr>
          </thead>
          <tbody>
            {shows.map((s) => (
              <tr key={s.id}>
                <td>
                  <input
                    defaultValue={s.name}
                    onBlur={(e) => { const v = e.target.value.trim(); if (v && v !== s.name) renameShow(s, v); }}
                    style={{ width: 260 }}
                  />
                </td>
                <td><button className="btn-link" onClick={() => deleteShow(s)}>Delete</button></td>
              </tr>
            ))}
            {shows.length === 0 && (
              <tr><td colSpan={2} style={{ color: 'var(--text-muted)' }}>No tentpole shows yet.</td></tr>
            )}
          </tbody>
        </table>
      </div>

      <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 16 }}>
        <input value={newShowName} onChange={(e) => setNewShowName(e.target.value)} placeholder="New show name" style={{ width: 260 }} />
        <button onClick={createShow}>Add show</button>
      </div>
    </div>
  );
}
