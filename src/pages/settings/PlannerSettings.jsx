import { useEffect, useState } from 'react';
import { appsScriptPost, jsonpRequest, verifyByPolling } from '../../api/appsScript';
import { SANDBOX_API_URL } from '../../api/config';

// Lead Media Planners settings (confirmed 2026-09-14) — Users had no write
// actions at all before this; the Sheet had to be hand-edited. Role
// (Write/Read) is now editable here too, added the same day once testers
// started needing Write access without someone hand-editing the Sheet —
// still a deliberate, explicit action per row (a plain select, not a
// bulk/self-service toggle), matching the access model's intent that
// granting Write stays a conscious admin decision.
export default function PlannerSettings() {
  const [users, setUsers] = useState([]);
  const [status, setStatus] = useState('loading');
  const [error, setError] = useState(null);
  const [newName, setNewName] = useState('');
  const [newEmail, setNewEmail] = useState('');

  const refresh = () => {
    setStatus('loading');
    jsonpRequest(SANDBOX_API_URL, { action: 'listUsers' })
      .then((rows) => { setUsers(rows); setStatus('done'); })
      .catch((err) => { setError(err.message); setStatus('error'); });
  };

  useEffect(refresh, []);

  const createUser = async () => {
    const name = newName.trim();
    const email = newEmail.trim();
    if (!name || !email) return;
    setUsers((prev) => [...prev, { name, email, role: 'read' }]);
    try {
      await appsScriptPost(SANDBOX_API_URL, { action: 'createUser', payload: JSON.stringify({ name, email }) });
      await verifyByPolling(async () => {
        const rows = await jsonpRequest(SANDBOX_API_URL, { action: 'listUsers' });
        return rows.some((u) => u.email === email);
      });
      setNewName('');
      setNewEmail('');
    } catch (err) {
      setUsers((prev) => prev.filter((u) => u.email !== email));
      window.alert(`Could not add planner: ${err.message}`);
    }
  };

  const updateUser = async (row, field, value) => {
    const previous = users;
    const originalEmail = row.email;
    setUsers((prev) => prev.map((u) => (u.email === originalEmail ? { ...u, [field]: value } : u)));
    try {
      await appsScriptPost(SANDBOX_API_URL, {
        action: 'updateUser',
        payload: JSON.stringify({
          originalEmail,
          email: field === 'email' ? value : row.email,
          name: field === 'name' ? value : row.name,
          role: field === 'role' ? value : row.role,
        }),
      });
      await verifyByPolling(async () => {
        const rows = await jsonpRequest(SANDBOX_API_URL, { action: 'listUsers' });
        const updated = rows.find((u) => u.email === (field === 'email' ? value : originalEmail));
        return !!updated && updated[field] === value;
      });
    } catch (err) {
      setUsers(previous);
      window.alert(`Could not update planner: ${err.message}`);
    }
  };

  const deleteUser = async (row) => {
    if (!window.confirm(`Remove "${row.name || row.email}" from the Lead Media Planner list? Existing Assignments keep whatever planner they already have.`)) return;
    const previous = users;
    setUsers((prev) => prev.filter((u) => u.email !== row.email));
    try {
      await appsScriptPost(SANDBOX_API_URL, { action: 'deleteUser', payload: JSON.stringify({ email: row.email }) });
      await verifyByPolling(async () => {
        const rows = await jsonpRequest(SANDBOX_API_URL, { action: 'listUsers' });
        return !rows.some((u) => u.email === row.email);
      });
    } catch (err) {
      setUsers(previous);
      window.alert(`Could not remove planner: ${err.message}`);
    }
  };

  if (status === 'loading') return <p>Loading planners…</p>;
  if (status === 'error') return <p style={{ color: 'crimson' }}>Failed: {error}</p>;

  return (
    <div>
      <h2>Lead Media Planners</h2>
      <p style={{ color: 'var(--text-muted)', maxWidth: 560 }}>
        Backs the Assignment form's Lead Media Planner dropdown and the notify-list. Role controls whether someone can edit anything or just view — grant Write deliberately, one person at a time.
      </p>

      <div className="table-scroll" style={{ maxWidth: 560, marginTop: 16 }}>
        <table>
          <thead>
            <tr><th>Name</th><th>Email</th><th>Role</th><th></th></tr>
          </thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.email}>
                <td>
                  <input
                    defaultValue={u.name}
                    onBlur={(e) => { const v = e.target.value.trim(); if (v && v !== u.name) updateUser(u, 'name', v); }}
                    style={{ width: 160 }}
                  />
                </td>
                <td>
                  <input
                    defaultValue={u.email}
                    onBlur={(e) => { const v = e.target.value.trim(); if (v && v !== u.email) updateUser(u, 'email', v); }}
                    style={{ width: 220 }}
                  />
                </td>
                <td>
                  <select value={u.role || 'read'} onChange={(e) => updateUser(u, 'role', e.target.value)}>
                    <option value="read">Read</option>
                    <option value="write">Write</option>
                  </select>
                </td>
                <td><button className="btn-link" onClick={() => deleteUser(u)}>Delete</button></td>
              </tr>
            ))}
            {users.length === 0 && (
              <tr><td colSpan={4} style={{ color: 'var(--text-muted)' }}>No planners yet.</td></tr>
            )}
          </tbody>
        </table>
      </div>

      <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 16 }}>
        <input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="Name" style={{ width: 160 }} />
        <input value={newEmail} onChange={(e) => setNewEmail(e.target.value)} placeholder="Email" style={{ width: 220 }} />
        <button onClick={createUser}>Add planner</button>
      </div>
    </div>
  );
}
