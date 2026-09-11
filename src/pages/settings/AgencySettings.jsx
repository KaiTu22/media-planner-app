import { useEffect, useState } from 'react';
import { appsScriptPost, jsonpRequest, verifyByPolling } from '../../api/appsScript';
import { SANDBOX_API_URL } from '../../api/config';

// Agency is a managed list, not free-form (confirmed 2026-09-11) — the
// Assignment form's Agency field is a strict dropdown over this list, so an
// agency has to be added here before it can be selected there. Editing an
// existing row only ever changes its Hold Co (mirrors TagsSettings'
// recolorTag, which never renames the tag either) — renaming the agency
// itself isn't supported inline since AgencyHoldCo has no synthetic id, only
// the agency name as its natural key; delete + re-add covers that rare case.
export default function AgencySettings() {
  const [rows, setRows] = useState([]);
  const [status, setStatus] = useState('loading');
  const [error, setError] = useState(null);
  const [newAgency, setNewAgency] = useState('');
  const [newHoldCo, setNewHoldCo] = useState('');

  const refresh = () => {
    setStatus('loading');
    jsonpRequest(SANDBOX_API_URL, { action: 'listAgencyHoldCo' })
      .then((data) => { setRows(data); setStatus('done'); })
      .catch((err) => { setError(err.message); setStatus('error'); });
  };

  useEffect(refresh, []);

  const createEntry = async () => {
    const agency = newAgency.trim();
    const holdCo = newHoldCo.trim();
    if (!agency || !holdCo) return;
    setRows((prev) => [...prev, { agency, holdCo }]);
    try {
      await appsScriptPost(SANDBOX_API_URL, { action: 'createAgencyHoldCoEntry', payload: JSON.stringify({ agency, holdCo }) });
      await verifyByPolling(async () => {
        const data = await jsonpRequest(SANDBOX_API_URL, { action: 'listAgencyHoldCo' });
        return data.some((r) => r.agency === agency);
      });
      setNewAgency('');
      setNewHoldCo('');
    } catch (err) {
      setRows((prev) => prev.filter((r) => r.agency !== agency));
      window.alert(`Could not add agency: ${err.message}`);
    }
  };

  const updateHoldCo = async (row, holdCo) => {
    const previous = rows;
    setRows((prev) => prev.map((r) => (r.agency === row.agency ? { ...r, holdCo } : r)));
    try {
      await appsScriptPost(SANDBOX_API_URL, { action: 'updateAgencyHoldCoEntry', payload: JSON.stringify({ agency: row.agency, holdCo }) });
      await verifyByPolling(async () => {
        const data = await jsonpRequest(SANDBOX_API_URL, { action: 'listAgencyHoldCo' });
        return data.find((r) => r.agency === row.agency)?.holdCo === holdCo;
      });
    } catch (err) {
      setRows(previous);
      window.alert(`Could not update Hold Co: ${err.message}`);
    }
  };

  const deleteEntry = async (row) => {
    if (!window.confirm(`Remove "${row.agency}" from the Agency list? Existing Assignments keep whatever Agency they already have.`)) return;
    const previous = rows;
    setRows((prev) => prev.filter((r) => r.agency !== row.agency));
    try {
      await appsScriptPost(SANDBOX_API_URL, { action: 'deleteAgencyHoldCoEntry', payload: JSON.stringify({ agency: row.agency }) });
      await verifyByPolling(async () => {
        const data = await jsonpRequest(SANDBOX_API_URL, { action: 'listAgencyHoldCo' });
        return !data.some((r) => r.agency === row.agency);
      });
    } catch (err) {
      setRows(previous);
      window.alert(`Could not remove agency: ${err.message}`);
    }
  };

  if (status === 'loading') return <p>Loading agencies…</p>;
  if (status === 'error') return <p style={{ color: 'crimson' }}>Failed: {error}</p>;

  return (
    <div>
      <h2>Agency / Hold Co</h2>
      <p style={{ color: 'var(--text-muted)', maxWidth: 560 }}>
        A managed list, shared by the Assignment form's Agency dropdown — add an agency here before it can be selected there. Hold Co auto-fills from this mapping when an Assignment is created.
      </p>

      <div className="table-scroll" style={{ maxWidth: 560, marginTop: 16 }}>
        <table>
          <thead>
            <tr><th>Agency</th><th>Hold Co</th><th></th></tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.agency}>
                <td>{r.agency}</td>
                <td>
                  <input
                    defaultValue={r.holdCo}
                    onBlur={(e) => { if (e.target.value.trim() && e.target.value !== r.holdCo) updateHoldCo(r, e.target.value.trim()); }}
                    style={{ width: 140 }}
                  />
                </td>
                <td><button className="btn-link" onClick={() => deleteEntry(r)}>Delete</button></td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr><td colSpan={3} style={{ color: 'var(--text-muted)' }}>No agencies yet.</td></tr>
            )}
          </tbody>
        </table>
      </div>

      <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 16 }}>
        <input value={newAgency} onChange={(e) => setNewAgency(e.target.value)} placeholder="Agency name" style={{ width: 180 }} />
        <input value={newHoldCo} onChange={(e) => setNewHoldCo(e.target.value)} placeholder="Hold Co" style={{ width: 140 }} />
        <button onClick={createEntry}>Add agency</button>
      </div>
    </div>
  );
}
