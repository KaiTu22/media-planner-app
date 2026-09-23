import { useEffect, useMemo, useState } from 'react';
import { appsScriptPost, jsonpRequest, verifyByPolling } from '../../api/appsScript';
import { SANDBOX_API_URL } from '../../api/config';

// Shows / Franchises (renamed from "Tentpole Shows" 2026-09-23) — backs the
// Assignment form's Tentpole Show dropdown (for the "Show / Tentpole" Deal
// Category) and the Sponsorship Hub's show/franchise selector, one shared
// list either way. Season/Year nests under a specific Show here (confirmed
// 2026-09-23) — "Season 51" only means something under "Survivor" — same
// nested-list presentation as Agency under Hold Co, except Season/Year rows
// can't be reassigned to a different Show (unlike Agency, which can move
// Hold Cos) since a season only ever belongs to the show it was created
// under. Keyed on synthetic ids throughout (like Tags), so renaming a Show
// never requires updating its Season/Year rows — they reference the Show's
// id, not its name, unlike Agency/HoldCo's natural-key rename cascade.
export default function TentpoleShowSettings() {
  const [shows, setShows] = useState([]);
  const [seasonYears, setSeasonYears] = useState([]);
  const [status, setStatus] = useState('loading');
  const [error, setError] = useState(null);
  const [newShowName, setNewShowName] = useState('');
  const [newSeasonYearDrafts, setNewSeasonYearDrafts] = useState({});

  const refresh = () => {
    setStatus('loading');
    Promise.all([
      jsonpRequest(SANDBOX_API_URL, { action: 'listTentpoleShows' }),
      jsonpRequest(SANDBOX_API_URL, { action: 'listSeasonYears' }),
    ])
      .then(([showRows, seasonYearRows]) => { setShows(showRows); setSeasonYears(seasonYearRows); setStatus('done'); })
      .catch((err) => { setError(err.message); setStatus('error'); });
  };

  useEffect(refresh, []);

  const seasonYearsByShow = useMemo(() => {
    const map = {};
    shows.forEach((s) => { map[s.id] = []; });
    seasonYears.forEach((sy) => { if (map[sy.showId]) map[sy.showId].push(sy); });
    return map;
  }, [shows, seasonYears]);

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
      window.alert(`Could not add show: ${err.message}`);
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
      window.alert(`Could not rename show: ${err.message}`);
    }
  };

  const deleteShow = async (show) => {
    const childCount = (seasonYearsByShow[show.id] || []).length;
    const warning = childCount > 0
      ? `Delete "${show.name}"? Its ${childCount} season/year${childCount === 1 ? '' : 's'} will also be deleted. Any project currently set to this show keeps its Deal Category but loses the show/season.`
      : `Delete "${show.name}"? Any project currently set to this show keeps its Deal Category but loses this specific show.`;
    if (!window.confirm(warning)) return;
    const previousShows = shows;
    const previousSeasonYears = seasonYears;
    setShows((prev) => prev.filter((s) => s.id !== show.id));
    setSeasonYears((prev) => prev.filter((sy) => sy.showId !== show.id));
    try {
      await appsScriptPost(SANDBOX_API_URL, { action: 'deleteTentpoleShow', payload: JSON.stringify({ id: show.id }) });
      await verifyByPolling(async () => {
        const rows = await jsonpRequest(SANDBOX_API_URL, { action: 'listTentpoleShows' });
        return !rows.some((s) => s.id === show.id);
      });
    } catch (err) {
      setShows(previousShows);
      setSeasonYears(previousSeasonYears);
      window.alert(`Could not delete show: ${err.message}`);
    }
  };

  const createSeasonYear = async (showId) => {
    const name = (newSeasonYearDrafts[showId] || '').trim();
    if (!name) return;
    const id = `season-year-${Date.now()}`;
    setSeasonYears((prev) => [...prev, { id, showId, name }]);
    try {
      await appsScriptPost(SANDBOX_API_URL, { action: 'createSeasonYear', payload: JSON.stringify({ id, showId, name }) });
      await verifyByPolling(async () => {
        const rows = await jsonpRequest(SANDBOX_API_URL, { action: 'listSeasonYears' });
        return rows.some((sy) => sy.id === id);
      });
      setNewSeasonYearDrafts((prev) => ({ ...prev, [showId]: '' }));
    } catch (err) {
      setSeasonYears((prev) => prev.filter((sy) => sy.id !== id));
      window.alert(`Could not add season/year: ${err.message}`);
    }
  };

  const renameSeasonYear = async (seasonYear, name) => {
    const previous = seasonYears;
    setSeasonYears((prev) => prev.map((sy) => (sy.id === seasonYear.id ? { ...sy, name } : sy)));
    try {
      await appsScriptPost(SANDBOX_API_URL, { action: 'updateSeasonYear', payload: JSON.stringify({ id: seasonYear.id, name }) });
      await verifyByPolling(async () => {
        const rows = await jsonpRequest(SANDBOX_API_URL, { action: 'listSeasonYears' });
        return rows.find((sy) => sy.id === seasonYear.id)?.name === name;
      });
    } catch (err) {
      setSeasonYears(previous);
      window.alert(`Could not rename season/year: ${err.message}`);
    }
  };

  const deleteSeasonYear = async (seasonYear) => {
    if (!window.confirm(`Delete "${seasonYear.name}"?`)) return;
    const previous = seasonYears;
    setSeasonYears((prev) => prev.filter((sy) => sy.id !== seasonYear.id));
    try {
      await appsScriptPost(SANDBOX_API_URL, { action: 'deleteSeasonYear', payload: JSON.stringify({ id: seasonYear.id }) });
      await verifyByPolling(async () => {
        const rows = await jsonpRequest(SANDBOX_API_URL, { action: 'listSeasonYears' });
        return !rows.some((sy) => sy.id === seasonYear.id);
      });
    } catch (err) {
      setSeasonYears(previous);
      window.alert(`Could not delete season/year: ${err.message}`);
    }
  };

  if (status === 'loading') return <p>Loading shows…</p>;
  if (status === 'error') return <p style={{ color: 'crimson' }}>Failed: {error}</p>;

  return (
    <div>
      <h2>Shows / Franchises</h2>
      <p style={{ color: 'var(--text-muted)', maxWidth: 560 }}>
        Backs the Assignment form's Tentpole Show dropdown (for the "Show / Tentpole" Deal Category) and the Sponsorship Hub's show/franchise selector. Season/Year nests under a specific show — e.g. "Season 51" under "Survivor" — since it only means something in that context.
      </p>

      <div style={{ display: 'flex', gap: 8, alignItems: 'center', margin: '12px 0 20px' }}>
        <input value={newShowName} onChange={(e) => setNewShowName(e.target.value)} placeholder="New show name" style={{ width: 200 }} />
        <button onClick={createShow}>Add show</button>
      </div>

      {shows.map((show) => (
        <div key={show.id} style={{ marginBottom: 20, maxWidth: 560 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
            <input
              defaultValue={show.name}
              onBlur={(e) => { const v = e.target.value.trim(); if (v && v !== show.name) renameShow(show, v); }}
              style={{ fontWeight: 700, fontSize: '1rem', border: 'none', background: 'transparent', padding: '2px 4px', width: 220 }}
            />
            <button className="btn-link btn-link-danger" onClick={() => deleteShow(show)}>Delete Show</button>
          </div>

          <div className="table-scroll">
            <table>
              <thead>
                <tr><th>Season / Year</th><th></th></tr>
              </thead>
              <tbody>
                {(seasonYearsByShow[show.id] || []).map((sy) => (
                  <tr key={sy.id}>
                    <td>
                      <input
                        defaultValue={sy.name}
                        onBlur={(e) => { const v = e.target.value.trim(); if (v && v !== sy.name) renameSeasonYear(sy, v); }}
                        style={{ width: 200 }}
                      />
                    </td>
                    <td><button className="btn-link" onClick={() => deleteSeasonYear(sy)}>Delete</button></td>
                  </tr>
                ))}
                {(seasonYearsByShow[show.id] || []).length === 0 && (
                  <tr><td colSpan={2} style={{ color: 'var(--text-muted)' }}>No seasons/years yet.</td></tr>
                )}
              </tbody>
            </table>
          </div>

          <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
            <input
              value={newSeasonYearDrafts[show.id] || ''}
              onChange={(e) => setNewSeasonYearDrafts((prev) => ({ ...prev, [show.id]: e.target.value }))}
              placeholder="e.g. Season 51, or 2027"
              style={{ width: 200 }}
            />
            <button onClick={() => createSeasonYear(show.id)}>Add</button>
          </div>
        </div>
      ))}
      {shows.length === 0 && <p style={{ color: 'var(--text-muted)' }}>No shows yet.</p>}
    </div>
  );
}
