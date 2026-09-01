import { useEffect, useState } from 'react';
import { appsScriptPost, jsonpRequest, verifyByPolling } from '../api/appsScript';
import { SANDBOX_API_URL } from '../api/config';

// Proves Project CRUD, §5.1 lookup derivation (pitchTeam/holdCo), and §5.2
// Drive folder auto-creation against the real schema sandbox, using the
// same proven read/write client as the closed_deals pilot.
export default function SandboxCheck() {
  const [whoami, setWhoami] = useState(null);
  const [projects, setProjects] = useState([]);
  const [status, setStatus] = useState('loading');
  const [error, setError] = useState(null);
  const [form, setForm] = useState({
    projectName: '',
    account: '',
    brand: '',
    agency: 'Agency D7',
    pitchLeadName: 'Nicole Rosenberg',
  });
  const [creating, setCreating] = useState(false);

  const refresh = () => {
    setStatus('loading');
    Promise.all([
      jsonpRequest(SANDBOX_API_URL, { action: 'whoami' }),
      jsonpRequest(SANDBOX_API_URL, { action: 'listProjects' }),
    ])
      .then(([user, projectRows]) => {
        setWhoami(user);
        setProjects(projectRows);
        setStatus('done');
      })
      .catch((err) => {
        setError(err.message);
        setStatus('error');
      });
  };

  useEffect(refresh, []);

  const updateField = (field) => (e) => setForm((f) => ({ ...f, [field]: e.target.value }));

  const createTestProject = async () => {
    if (!form.projectName.trim()) return;
    setCreating(true);
    setError(null);
    const id = `test-${Date.now()}`;
    try {
      await appsScriptPost(SANDBOX_API_URL, {
        action: 'createProject',
        payload: JSON.stringify({ id, ...form }),
      });
      await verifyByPolling(async () => {
        const rows = await jsonpRequest(SANDBOX_API_URL, { action: 'listProjects' });
        if (rows.find((r) => r.id === id)) {
          setProjects(rows);
          return true;
        }
        return false;
      });
      setForm((f) => ({ ...f, projectName: '' }));
    } catch (err) {
      setError(err.message);
    } finally {
      setCreating(false);
    }
  };

  if (status === 'loading') return <p>Loading sandbox data…</p>;
  if (status === 'error') return <p style={{ color: 'crimson' }}>Failed: {error}</p>;

  return (
    <div>
      <h2>Sandbox schema check</h2>
      <p>Signed in as {whoami.email} ({whoami.role})</p>

      <h3>Projects ({projects.length})</h3>
      <ul>
        {projects.map((p) => (
          <li key={p.id}>
            <strong>{p.projectName}</strong> — {p.account} / {p.brand}
            <br />
            Pitch lead: {p.pitchLeadName} → pitchTeam: {p.pitchTeam || '(none)'} | Agency: {p.agency} → holdCo: {p.holdCo || '(none)'}
            <br />
            Folder: {p.driveFolderLink ? <a href={p.driveFolderLink} target="_blank" rel="noreferrer">{p.driveFolderLink}</a> : '(none)'}
          </li>
        ))}
      </ul>

      <h3>Create test project</h3>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, maxWidth: 320 }}>
        <input value={form.projectName} onChange={updateField('projectName')} placeholder="Project name" />
        <input value={form.account} onChange={updateField('account')} placeholder="Account" />
        <input value={form.brand} onChange={updateField('brand')} placeholder="Brand" />
        <select value={form.agency} onChange={updateField('agency')}>
          <option>Agency D7</option>
          <option>Carat</option>
        </select>
        <select value={form.pitchLeadName} onChange={updateField('pitchLeadName')}>
          <option>Nicole Rosenberg</option>
          <option>Bari Zibrak</option>
        </select>
        <button onClick={createTestProject} disabled={creating || whoami.role !== 'write'}>
          {creating ? 'Creating…' : 'Create'}
        </button>
      </div>
      {whoami.role !== 'write' && <p>Read-only user — create is disabled.</p>}
      {error && <p style={{ color: 'crimson' }}>Failed: {error}</p>}
    </div>
  );
}
