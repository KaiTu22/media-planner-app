import { useEffect, useMemo, useState } from 'react';
import { appsScriptPost, jsonpRequest, verifyByPolling } from '../../api/appsScript';
import { SANDBOX_API_URL } from '../../api/config';

// Hold Co is a standalone managed list (confirmed 2026-09-14) — it can exist
// with nothing nested under it yet (e.g. onboarding a new Hold Co
// relationship before any specific agency deal exists). Agency stays exactly
// what it was (an AgencyHoldCo row, still what the Assignment form's Agency
// dropdown reads) — this page just presents those rows nested under their
// Hold Co instead of a flat re-typed-every-row table. Deleting a Hold Co
// never deletes its agencies, only unassigns them (mirrors TagsSettings'
// deleteTag_, which strips a tag from projects rather than deleting them).
export default function AgencySettings() {
  const [holdCos, setHoldCos] = useState([]);
  const [agencies, setAgencies] = useState([]);
  const [status, setStatus] = useState('loading');
  const [error, setError] = useState(null);
  const [newHoldCoName, setNewHoldCoName] = useState('');
  const [newAgencyDrafts, setNewAgencyDrafts] = useState({});

  const refresh = () => {
    setStatus('loading');
    Promise.all([
      jsonpRequest(SANDBOX_API_URL, { action: 'listHoldCos' }),
      jsonpRequest(SANDBOX_API_URL, { action: 'listAgencyHoldCo' }),
    ])
      .then(([holdCoRows, agencyRows]) => { setHoldCos(holdCoRows); setAgencies(agencyRows); setStatus('done'); })
      .catch((err) => { setError(err.message); setStatus('error'); });
  };

  useEffect(refresh, []);

  const holdCoNames = useMemo(() => [...holdCos].map((h) => h.name).sort(), [holdCos]);

  const agenciesByHoldCo = useMemo(() => {
    const map = {};
    holdCoNames.forEach((name) => { map[name] = []; });
    const unassigned = [];
    agencies.forEach((a) => {
      if (a.holdCo && map[a.holdCo]) map[a.holdCo].push(a);
      else unassigned.push(a);
    });
    return { map, unassigned };
  }, [agencies, holdCoNames]);

  const createHoldCo = async () => {
    const name = newHoldCoName.trim();
    if (!name) return;
    setHoldCos((prev) => [...prev, { name }]);
    try {
      await appsScriptPost(SANDBOX_API_URL, { action: 'createHoldCo', payload: JSON.stringify({ name }) });
      await verifyByPolling(async () => {
        const rows = await jsonpRequest(SANDBOX_API_URL, { action: 'listHoldCos' });
        return rows.some((h) => h.name === name);
      });
      setNewHoldCoName('');
    } catch (err) {
      setHoldCos((prev) => prev.filter((h) => h.name !== name));
      window.alert(`Could not add Hold Co: ${err.message}`);
    }
  };

  const renameHoldCo = async (oldName, newName) => {
    if (!newName || newName === oldName) return;
    const previousHoldCos = holdCos;
    const previousAgencies = agencies;
    setHoldCos((prev) => prev.map((h) => (h.name === oldName ? { ...h, name: newName } : h)));
    setAgencies((prev) => prev.map((a) => (a.holdCo === oldName ? { ...a, holdCo: newName } : a)));
    try {
      await appsScriptPost(SANDBOX_API_URL, { action: 'updateHoldCo', payload: JSON.stringify({ originalName: oldName, name: newName }) });
      await verifyByPolling(async () => {
        const rows = await jsonpRequest(SANDBOX_API_URL, { action: 'listHoldCos' });
        return rows.some((h) => h.name === newName);
      });
    } catch (err) {
      setHoldCos(previousHoldCos);
      setAgencies(previousAgencies);
      window.alert(`Could not rename Hold Co: ${err.message}`);
    }
  };

  const deleteHoldCo = async (name) => {
    const count = (agenciesByHoldCo.map[name] || []).length;
    const warning = count > 0
      ? `Delete "${name}"? Its ${count} agenc${count === 1 ? 'y becomes' : 'ies become'} Unassigned, not deleted.`
      : `Delete "${name}"?`;
    if (!window.confirm(warning)) return;
    const previousHoldCos = holdCos;
    const previousAgencies = agencies;
    setHoldCos((prev) => prev.filter((h) => h.name !== name));
    setAgencies((prev) => prev.map((a) => (a.holdCo === name ? { ...a, holdCo: '' } : a)));
    try {
      await appsScriptPost(SANDBOX_API_URL, { action: 'deleteHoldCo', payload: JSON.stringify({ name }) });
      await verifyByPolling(async () => {
        const rows = await jsonpRequest(SANDBOX_API_URL, { action: 'listHoldCos' });
        return !rows.some((h) => h.name === name);
      });
    } catch (err) {
      setHoldCos(previousHoldCos);
      setAgencies(previousAgencies);
      window.alert(`Could not delete Hold Co: ${err.message}`);
    }
  };

  const createAgency = async (holdCo) => {
    const agency = (newAgencyDrafts[holdCo] || '').trim();
    if (!agency) return;
    setAgencies((prev) => [...prev, { agency, holdCo }]);
    try {
      await appsScriptPost(SANDBOX_API_URL, { action: 'createAgencyHoldCoEntry', payload: JSON.stringify({ agency, holdCo }) });
      await verifyByPolling(async () => {
        const rows = await jsonpRequest(SANDBOX_API_URL, { action: 'listAgencyHoldCo' });
        return rows.some((r) => r.agency === agency);
      });
      setNewAgencyDrafts((prev) => ({ ...prev, [holdCo]: '' }));
    } catch (err) {
      setAgencies((prev) => prev.filter((a) => a.agency !== agency));
      window.alert(`Could not add agency: ${err.message}`);
    }
  };

  const moveAgency = async (row, holdCo) => {
    const previous = agencies;
    setAgencies((prev) => prev.map((a) => (a.agency === row.agency ? { ...a, holdCo } : a)));
    try {
      await appsScriptPost(SANDBOX_API_URL, { action: 'updateAgencyHoldCoEntry', payload: JSON.stringify({ agency: row.agency, holdCo }) });
      await verifyByPolling(async () => {
        const rows = await jsonpRequest(SANDBOX_API_URL, { action: 'listAgencyHoldCo' });
        return rows.find((r) => r.agency === row.agency)?.holdCo === holdCo;
      });
    } catch (err) {
      setAgencies(previous);
      window.alert(`Could not move agency: ${err.message}`);
    }
  };

  const deleteAgency = async (row) => {
    if (!window.confirm(`Remove "${row.agency}" from the Agency list? Existing Assignments keep whatever Agency they already have.`)) return;
    const previous = agencies;
    setAgencies((prev) => prev.filter((a) => a.agency !== row.agency));
    try {
      await appsScriptPost(SANDBOX_API_URL, { action: 'deleteAgencyHoldCoEntry', payload: JSON.stringify({ agency: row.agency }) });
      await verifyByPolling(async () => {
        const rows = await jsonpRequest(SANDBOX_API_URL, { action: 'listAgencyHoldCo' });
        return !rows.some((r) => r.agency === row.agency);
      });
    } catch (err) {
      setAgencies(previous);
      window.alert(`Could not remove agency: ${err.message}`);
    }
  };

  if (status === 'loading') return <p>Loading agencies…</p>;
  if (status === 'error') return <p style={{ color: 'crimson' }}>Failed: {error}</p>;

  const renderGroup = (holdCoName, rows, isUnassigned = false) => (
    <div key={holdCoName || 'unassigned'} style={{ marginBottom: 20, maxWidth: 560 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
        {isUnassigned ? (
          <h3 style={{ margin: 0, color: 'var(--text-muted)' }}>Unassigned</h3>
        ) : (
          <input
            defaultValue={holdCoName}
            onBlur={(e) => { const v = e.target.value.trim(); if (v && v !== holdCoName) renameHoldCo(holdCoName, v); }}
            style={{ fontWeight: 700, fontSize: '1rem', border: 'none', background: 'transparent', padding: '2px 4px', width: 220 }}
          />
        )}
        {!isUnassigned && (
          <button className="btn-link btn-link-danger" onClick={() => deleteHoldCo(holdCoName)}>Delete Hold Co</button>
        )}
      </div>

      <div className="table-scroll">
        <table>
          <thead>
            <tr><th>Agency</th><th>Hold Co</th><th></th></tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.agency}>
                <td>{r.agency}</td>
                <td>
                  <select value={r.holdCo || ''} onChange={(e) => moveAgency(r, e.target.value)}>
                    <option value="">Unassigned</option>
                    {holdCoNames.map((n) => <option key={n} value={n}>{n}</option>)}
                  </select>
                </td>
                <td><button className="btn-link" onClick={() => deleteAgency(r)}>Delete</button></td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr><td colSpan={3} style={{ color: 'var(--text-muted)' }}>No agencies here yet.</td></tr>
            )}
          </tbody>
        </table>
      </div>

      <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
        <input
          value={newAgencyDrafts[holdCoName] || ''}
          onChange={(e) => setNewAgencyDrafts((prev) => ({ ...prev, [holdCoName]: e.target.value }))}
          placeholder="Add agency"
          style={{ width: 200 }}
        />
        <button onClick={() => createAgency(holdCoName)}>Add</button>
      </div>
    </div>
  );

  return (
    <div>
      <h2>Agency / Hold Co</h2>
      <p style={{ color: 'var(--text-muted)', maxWidth: 560 }}>
        Hold Cos are a managed list; agencies nest under one. The Assignment form's Agency dropdown lists every agency here regardless of which Hold Co it's under.
      </p>

      <div style={{ display: 'flex', gap: 8, alignItems: 'center', margin: '12px 0 20px' }}>
        <input value={newHoldCoName} onChange={(e) => setNewHoldCoName(e.target.value)} placeholder="New Hold Co name" style={{ width: 200 }} />
        <button onClick={createHoldCo}>Add Hold Co</button>
      </div>

      {holdCoNames.map((name) => renderGroup(name, agenciesByHoldCo.map[name] || []))}
      {agenciesByHoldCo.unassigned.length > 0 && renderGroup('', agenciesByHoldCo.unassigned, true)}
    </div>
  );
}
