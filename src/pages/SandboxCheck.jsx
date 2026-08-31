import { useEffect, useState } from 'react';
import { appsScriptPost, jsonpRequest } from '../api/appsScript';
import { SANDBOX_API_URL } from '../api/config';

// Proves basic Project CRUD against the real schema sandbox (§5), using the
// same proven read/write client as the closed_deals pilot.
export default function SandboxCheck() {
  const [whoami, setWhoami] = useState(null);
  const [projects, setProjects] = useState([]);
  const [status, setStatus] = useState('loading');
  const [error, setError] = useState(null);
  const [projectName, setProjectName] = useState('');
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

  const createTestProject = async () => {
    if (!projectName.trim()) return;
    setCreating(true);
    setError(null);
    const id = `test-${Date.now()}`;
    try {
      await appsScriptPost(SANDBOX_API_URL, {
        action: 'createProject',
        payload: JSON.stringify({ id, projectName, account: 'Sandbox Test' }),
      });
      const rows = await jsonpRequest(SANDBOX_API_URL, { action: 'listProjects' });
      const created = rows.find((r) => r.id === id);
      if (!created) throw new Error('Project did not appear in a follow-up read.');
      setProjects(rows);
      setProjectName('');
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
          <li key={p.id}>{p.projectName} — {p.account}</li>
        ))}
      </ul>

      <h3>Create test project</h3>
      <input
        value={projectName}
        onChange={(e) => setProjectName(e.target.value)}
        placeholder="Project name"
      />
      <button onClick={createTestProject} disabled={creating || whoami.role !== 'write'}>
        {creating ? 'Creating…' : 'Create'}
      </button>
      {whoami.role !== 'write' && <p>Read-only user — create is disabled.</p>}
      {error && <p style={{ color: 'crimson' }}>Failed: {error}</p>}
    </div>
  );
}
