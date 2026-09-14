import { useEffect, useMemo, useState } from 'react';
import { appsScriptPost, jsonpRequest, verifyByPolling } from '../../api/appsScript';
import { SANDBOX_API_URL } from '../../api/config';

// Pitch Team is a standalone managed list (confirmed 2026-09-14) — it can
// exist with nothing nested under it yet, same reasoning as AgencySettings'
// Hold Co. Pitch Lead stays exactly what it was (a TeamRoster row, still
// what the Assignment form's Pitch Lead dropdown reads) — this page just
// presents those rows nested under their Pitch Team instead of a flat
// re-typed-every-row table. Deleting a Pitch Team never deletes its pitch
// leads, only unassigns them.
export default function TeamRosterSettings() {
  const [pitchTeams, setPitchTeams] = useState([]);
  const [leads, setLeads] = useState([]);
  const [status, setStatus] = useState('loading');
  const [error, setError] = useState(null);
  const [newPitchTeamName, setNewPitchTeamName] = useState('');
  const [newLeadDrafts, setNewLeadDrafts] = useState({});

  const refresh = () => {
    setStatus('loading');
    Promise.all([
      jsonpRequest(SANDBOX_API_URL, { action: 'listPitchTeams' }),
      jsonpRequest(SANDBOX_API_URL, { action: 'listTeamRoster' }),
    ])
      .then(([pitchTeamRows, leadRows]) => { setPitchTeams(pitchTeamRows); setLeads(leadRows); setStatus('done'); })
      .catch((err) => { setError(err.message); setStatus('error'); });
  };

  useEffect(refresh, []);

  const pitchTeamNames = useMemo(() => [...pitchTeams].map((t) => t.name).sort(), [pitchTeams]);

  const leadsByPitchTeam = useMemo(() => {
    const map = {};
    pitchTeamNames.forEach((name) => { map[name] = []; });
    const unassigned = [];
    leads.forEach((l) => {
      if (l.pitchTeam && map[l.pitchTeam]) map[l.pitchTeam].push(l);
      else unassigned.push(l);
    });
    return { map, unassigned };
  }, [leads, pitchTeamNames]);

  const createPitchTeam = async () => {
    const name = newPitchTeamName.trim();
    if (!name) return;
    setPitchTeams((prev) => [...prev, { name }]);
    try {
      await appsScriptPost(SANDBOX_API_URL, { action: 'createPitchTeam', payload: JSON.stringify({ name }) });
      await verifyByPolling(async () => {
        const rows = await jsonpRequest(SANDBOX_API_URL, { action: 'listPitchTeams' });
        return rows.some((t) => t.name === name);
      });
      setNewPitchTeamName('');
    } catch (err) {
      setPitchTeams((prev) => prev.filter((t) => t.name !== name));
      window.alert(`Could not add Pitch Team: ${err.message}`);
    }
  };

  const renamePitchTeam = async (oldName, newName) => {
    if (!newName || newName === oldName) return;
    const previousPitchTeams = pitchTeams;
    const previousLeads = leads;
    setPitchTeams((prev) => prev.map((t) => (t.name === oldName ? { ...t, name: newName } : t)));
    setLeads((prev) => prev.map((l) => (l.pitchTeam === oldName ? { ...l, pitchTeam: newName } : l)));
    try {
      await appsScriptPost(SANDBOX_API_URL, { action: 'updatePitchTeam', payload: JSON.stringify({ originalName: oldName, name: newName }) });
      await verifyByPolling(async () => {
        const rows = await jsonpRequest(SANDBOX_API_URL, { action: 'listPitchTeams' });
        return rows.some((t) => t.name === newName);
      });
    } catch (err) {
      setPitchTeams(previousPitchTeams);
      setLeads(previousLeads);
      window.alert(`Could not rename Pitch Team: ${err.message}`);
    }
  };

  const deletePitchTeam = async (name) => {
    const count = (leadsByPitchTeam.map[name] || []).length;
    const warning = count > 0
      ? `Delete "${name}"? Its ${count} pitch lead${count === 1 ? '' : 's'} become Unassigned, not deleted.`
      : `Delete "${name}"?`;
    if (!window.confirm(warning)) return;
    const previousPitchTeams = pitchTeams;
    const previousLeads = leads;
    setPitchTeams((prev) => prev.filter((t) => t.name !== name));
    setLeads((prev) => prev.map((l) => (l.pitchTeam === name ? { ...l, pitchTeam: '' } : l)));
    try {
      await appsScriptPost(SANDBOX_API_URL, { action: 'deletePitchTeam', payload: JSON.stringify({ name }) });
      await verifyByPolling(async () => {
        const rows = await jsonpRequest(SANDBOX_API_URL, { action: 'listPitchTeams' });
        return !rows.some((t) => t.name === name);
      });
    } catch (err) {
      setPitchTeams(previousPitchTeams);
      setLeads(previousLeads);
      window.alert(`Could not delete Pitch Team: ${err.message}`);
    }
  };

  const createLead = async (pitchTeam) => {
    const teamMemberName = (newLeadDrafts[pitchTeam] || '').trim();
    if (!teamMemberName) return;
    setLeads((prev) => [...prev, { teamMemberName, pitchTeam }]);
    try {
      await appsScriptPost(SANDBOX_API_URL, { action: 'createTeamRosterEntry', payload: JSON.stringify({ teamMemberName, pitchTeam }) });
      await verifyByPolling(async () => {
        const rows = await jsonpRequest(SANDBOX_API_URL, { action: 'listTeamRoster' });
        return rows.some((r) => r.teamMemberName === teamMemberName);
      });
      setNewLeadDrafts((prev) => ({ ...prev, [pitchTeam]: '' }));
    } catch (err) {
      setLeads((prev) => prev.filter((l) => l.teamMemberName !== teamMemberName));
      window.alert(`Could not add pitch lead: ${err.message}`);
    }
  };

  const moveLead = async (row, pitchTeam) => {
    const previous = leads;
    setLeads((prev) => prev.map((l) => (l.teamMemberName === row.teamMemberName ? { ...l, pitchTeam } : l)));
    try {
      await appsScriptPost(SANDBOX_API_URL, { action: 'updateTeamRosterEntry', payload: JSON.stringify({ teamMemberName: row.teamMemberName, pitchTeam }) });
      await verifyByPolling(async () => {
        const rows = await jsonpRequest(SANDBOX_API_URL, { action: 'listTeamRoster' });
        return rows.find((r) => r.teamMemberName === row.teamMemberName)?.pitchTeam === pitchTeam;
      });
    } catch (err) {
      setLeads(previous);
      window.alert(`Could not move pitch lead: ${err.message}`);
    }
  };

  const deleteLead = async (row) => {
    if (!window.confirm(`Remove "${row.teamMemberName}" from the Pitch Lead list? Existing Assignments keep whatever Pitch Lead they already have.`)) return;
    const previous = leads;
    setLeads((prev) => prev.filter((l) => l.teamMemberName !== row.teamMemberName));
    try {
      await appsScriptPost(SANDBOX_API_URL, { action: 'deleteTeamRosterEntry', payload: JSON.stringify({ teamMemberName: row.teamMemberName }) });
      await verifyByPolling(async () => {
        const rows = await jsonpRequest(SANDBOX_API_URL, { action: 'listTeamRoster' });
        return !rows.some((r) => r.teamMemberName === row.teamMemberName);
      });
    } catch (err) {
      setLeads(previous);
      window.alert(`Could not remove pitch lead: ${err.message}`);
    }
  };

  if (status === 'loading') return <p>Loading roster…</p>;
  if (status === 'error') return <p style={{ color: 'crimson' }}>Failed: {error}</p>;

  const renderGroup = (pitchTeamName, rows, isUnassigned = false) => (
    <div key={pitchTeamName || 'unassigned'} style={{ marginBottom: 20, maxWidth: 560 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
        {isUnassigned ? (
          <h3 style={{ margin: 0, color: 'var(--text-muted)' }}>Unassigned</h3>
        ) : (
          <input
            defaultValue={pitchTeamName}
            onBlur={(e) => { const v = e.target.value.trim(); if (v && v !== pitchTeamName) renamePitchTeam(pitchTeamName, v); }}
            style={{ fontWeight: 700, fontSize: '1rem', border: 'none', background: 'transparent', padding: '2px 4px', width: 220 }}
          />
        )}
        {!isUnassigned && (
          <button className="btn-link btn-link-danger" onClick={() => deletePitchTeam(pitchTeamName)}>Delete Pitch Team</button>
        )}
      </div>

      <div className="table-scroll">
        <table>
          <thead>
            <tr><th>Pitch Lead</th><th>Pitch Team</th><th></th></tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.teamMemberName}>
                <td>{r.teamMemberName}</td>
                <td>
                  <select value={r.pitchTeam || ''} onChange={(e) => moveLead(r, e.target.value)}>
                    <option value="">Unassigned</option>
                    {pitchTeamNames.map((n) => <option key={n} value={n}>{n}</option>)}
                  </select>
                </td>
                <td><button className="btn-link" onClick={() => deleteLead(r)}>Delete</button></td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr><td colSpan={3} style={{ color: 'var(--text-muted)' }}>No pitch leads here yet.</td></tr>
            )}
          </tbody>
        </table>
      </div>

      <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
        <input
          value={newLeadDrafts[pitchTeamName] || ''}
          onChange={(e) => setNewLeadDrafts((prev) => ({ ...prev, [pitchTeamName]: e.target.value }))}
          placeholder="Add pitch lead"
          style={{ width: 200 }}
        />
        <button onClick={() => createLead(pitchTeamName)}>Add</button>
      </div>
    </div>
  );

  return (
    <div>
      <h2>Pitch Lead / Pitch Team</h2>
      <p style={{ color: 'var(--text-muted)', maxWidth: 560 }}>
        Pitch Teams are a managed list; pitch leads nest under one. The Assignment form's Pitch Lead dropdown lists every pitch lead here regardless of which Pitch Team they're under.
      </p>

      <div style={{ display: 'flex', gap: 8, alignItems: 'center', margin: '12px 0 20px' }}>
        <input value={newPitchTeamName} onChange={(e) => setNewPitchTeamName(e.target.value)} placeholder="New Pitch Team name" style={{ width: 200 }} />
        <button onClick={createPitchTeam}>Add Pitch Team</button>
      </div>

      {pitchTeamNames.map((name) => renderGroup(name, leadsByPitchTeam.map[name] || []))}
      {leadsByPitchTeam.unassigned.length > 0 && renderGroup('', leadsByPitchTeam.unassigned, true)}
    </div>
  );
}
