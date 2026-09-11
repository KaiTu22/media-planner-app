import { useEffect, useState } from 'react';
import { appsScriptPost, jsonpRequest, verifyByPolling } from '../../api/appsScript';
import { SANDBOX_API_URL } from '../../api/config';

// Pitch Lead is a managed list, not free-form (confirmed 2026-09-11) — the
// Assignment form's Pitch Lead dropdown is backed by this list, so a team
// member has to be added here before they can be selected there. Editing an
// existing row only ever changes its Pitch Team (mirrors TagsSettings'
// recolorTag / AgencySettings' updateHoldCo) — renaming the team member's
// name itself isn't supported inline since TeamRoster has no synthetic id,
// only the name as its natural key; delete + re-add covers that rare case.
export default function TeamRosterSettings() {
  const [rows, setRows] = useState([]);
  const [status, setStatus] = useState('loading');
  const [error, setError] = useState(null);
  const [newName, setNewName] = useState('');
  const [newPitchTeam, setNewPitchTeam] = useState('');

  const refresh = () => {
    setStatus('loading');
    jsonpRequest(SANDBOX_API_URL, { action: 'listTeamRoster' })
      .then((data) => { setRows(data); setStatus('done'); })
      .catch((err) => { setError(err.message); setStatus('error'); });
  };

  useEffect(refresh, []);

  const createEntry = async () => {
    const teamMemberName = newName.trim();
    const pitchTeam = newPitchTeam.trim();
    if (!teamMemberName || !pitchTeam) return;
    setRows((prev) => [...prev, { teamMemberName, pitchTeam }]);
    try {
      await appsScriptPost(SANDBOX_API_URL, { action: 'createTeamRosterEntry', payload: JSON.stringify({ teamMemberName, pitchTeam }) });
      await verifyByPolling(async () => {
        const data = await jsonpRequest(SANDBOX_API_URL, { action: 'listTeamRoster' });
        return data.some((r) => r.teamMemberName === teamMemberName);
      });
      setNewName('');
      setNewPitchTeam('');
    } catch (err) {
      setRows((prev) => prev.filter((r) => r.teamMemberName !== teamMemberName));
      window.alert(`Could not add team member: ${err.message}`);
    }
  };

  const updatePitchTeam = async (row, pitchTeam) => {
    const previous = rows;
    setRows((prev) => prev.map((r) => (r.teamMemberName === row.teamMemberName ? { ...r, pitchTeam } : r)));
    try {
      await appsScriptPost(SANDBOX_API_URL, { action: 'updateTeamRosterEntry', payload: JSON.stringify({ teamMemberName: row.teamMemberName, pitchTeam }) });
      await verifyByPolling(async () => {
        const data = await jsonpRequest(SANDBOX_API_URL, { action: 'listTeamRoster' });
        return data.find((r) => r.teamMemberName === row.teamMemberName)?.pitchTeam === pitchTeam;
      });
    } catch (err) {
      setRows(previous);
      window.alert(`Could not update Pitch Team: ${err.message}`);
    }
  };

  const deleteEntry = async (row) => {
    if (!window.confirm(`Remove "${row.teamMemberName}" from the Pitch Lead list? Existing Assignments keep whatever Pitch Lead they already have.`)) return;
    const previous = rows;
    setRows((prev) => prev.filter((r) => r.teamMemberName !== row.teamMemberName));
    try {
      await appsScriptPost(SANDBOX_API_URL, { action: 'deleteTeamRosterEntry', payload: JSON.stringify({ teamMemberName: row.teamMemberName }) });
      await verifyByPolling(async () => {
        const data = await jsonpRequest(SANDBOX_API_URL, { action: 'listTeamRoster' });
        return !data.some((r) => r.teamMemberName === row.teamMemberName);
      });
    } catch (err) {
      setRows(previous);
      window.alert(`Could not remove team member: ${err.message}`);
    }
  };

  if (status === 'loading') return <p>Loading roster…</p>;
  if (status === 'error') return <p style={{ color: 'crimson' }}>Failed: {error}</p>;

  return (
    <div>
      <h2>Pitch Lead / Pitch Team</h2>
      <p style={{ color: 'var(--text-muted)', maxWidth: 560 }}>
        A managed list, shared by the Assignment form's Pitch Lead dropdown — add a team member here before they can be selected there. Pitch Team auto-fills from this mapping when an Assignment is created.
      </p>

      <div className="table-scroll" style={{ maxWidth: 560, marginTop: 16 }}>
        <table>
          <thead>
            <tr><th>Pitch Lead</th><th>Pitch Team</th><th></th></tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.teamMemberName}>
                <td>{r.teamMemberName}</td>
                <td>
                  <input
                    defaultValue={r.pitchTeam}
                    onBlur={(e) => { if (e.target.value.trim() && e.target.value !== r.pitchTeam) updatePitchTeam(r, e.target.value.trim()); }}
                    style={{ width: 140 }}
                  />
                </td>
                <td><button className="btn-link" onClick={() => deleteEntry(r)}>Delete</button></td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr><td colSpan={3} style={{ color: 'var(--text-muted)' }}>No team members yet.</td></tr>
            )}
          </tbody>
        </table>
      </div>

      <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 16 }}>
        <input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="Pitch Lead name" style={{ width: 180 }} />
        <input value={newPitchTeam} onChange={(e) => setNewPitchTeam(e.target.value)} placeholder="Pitch Team" style={{ width: 140 }} />
        <button onClick={createEntry}>Add team member</button>
      </div>
    </div>
  );
}
