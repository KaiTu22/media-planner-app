import { useEffect, useState } from 'react';
import { appsScriptPost, jsonpRequest, verifyByPolling } from '../api/appsScript';
import { SANDBOX_API_URL } from '../api/config';

// Proves Project CRUD, §5.1 lookup derivation (pitchTeam/holdCo), and §5.2
// Drive folder auto-creation against the real schema sandbox, using the
// same proven read/write client as the closed_deals pilot.
export default function SandboxCheck() {
  const [whoami, setWhoami] = useState(null);
  const [projects, setProjects] = useState([]);
  const [versions, setVersions] = useState([]);
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
  const [creatingVersion, setCreatingVersion] = useState(false);

  const refresh = () => {
    setStatus('loading');
    Promise.all([
      jsonpRequest(SANDBOX_API_URL, { action: 'whoami' }),
      jsonpRequest(SANDBOX_API_URL, { action: 'listProjects' }),
      jsonpRequest(SANDBOX_API_URL, { action: 'listVersions' }),
    ])
      .then(([user, projectRows, versionRows]) => {
        setWhoami(user);
        setProjects(projectRows);
        setVersions(versionRows);
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

  const [concurrencyResult, setConcurrencyResult] = useState(null);
  const [runningConcurrency, setRunningConcurrency] = useState(false);

  // Weeks 12-13 hardening check: fires N writes at once from this one
  // authenticated tab (not N separate browser sessions) to stress the
  // Apps Script LockService serialization — checks both that every write
  // lands and that none got corrupted/interleaved with another's fields.
  const runConcurrencyTest = async (n) => {
    setRunningConcurrency(true);
    setConcurrencyResult(null);
    setError(null);
    const batchTag = Date.now();
    const testIds = Array.from({ length: n }, (_, i) => `concurrency-${batchTag}-${i}`);
    const startedAt = Date.now();
    try {
      await Promise.all(testIds.map((id, i) => appsScriptPost(SANDBOX_API_URL, {
        action: 'createProject',
        payload: JSON.stringify({
          id,
          projectName: `Concurrency Test ${i}`,
          account: `ConcurrencyAccount${i}`,
          brand: `ConcurrencyBrand${i}`,
        }),
      })));
      const elapsedMs = Date.now() - startedAt;

      const rows = await verifyByPolling(async () => {
        const all = await jsonpRequest(SANDBOX_API_URL, { action: 'listProjects' });
        const found = testIds.map((id) => all.find((r) => r.id === id)).filter(Boolean);
        return found.length === n ? found : false;
      }, { attempts: 15, intervalMs: 1000 });

      const corrupted = rows.filter((r, i) => {
        const expectedIndex = testIds.indexOf(r.id);
        return r.projectName !== `Concurrency Test ${expectedIndex}` || r.account !== `ConcurrencyAccount${expectedIndex}`;
      });

      setConcurrencyResult({
        requested: n,
        landed: rows.length,
        corrupted: corrupted.length,
        elapsedMs,
      });
      refresh();
    } catch (err) {
      setConcurrencyResult({ requested: n, landed: 0, corrupted: 0, error: err.message });
    } finally {
      setRunningConcurrency(false);
    }
  };

  const createTestVersion = async (projectId) => {
    setCreatingVersion(true);
    setError(null);
    const id = `testver-${Date.now()}`;
    try {
      await appsScriptPost(SANDBOX_API_URL, {
        action: 'createVersion',
        payload: JSON.stringify({
          id,
          projectId,
          name: `Test Version ${new Date().toLocaleTimeString()}`,
          completedDate: new Date().toISOString(),
          totalInvestment: Math.round(Math.random() * 500000),
          versionStatus: 'closed_pending_verification',
        }),
      });
      await verifyByPolling(async () => {
        const rows = await jsonpRequest(SANDBOX_API_URL, { action: 'listVersions' });
        if (rows.find((r) => r.id === id)) {
          setVersions(rows);
          return true;
        }
        return false;
      });
    } catch (err) {
      setError(err.message);
    } finally {
      setCreatingVersion(false);
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
            <br />
            <button onClick={() => createTestVersion(p.id)} disabled={creatingVersion || whoami.role !== 'write'}>
              {creatingVersion ? 'Creating version…' : 'Create test completed version'}
            </button>
          </li>
        ))}
      </ul>

      <h3>Versions ({versions.length})</h3>
      <ul>
        {versions.map((v) => (
          <li key={v.id}>
            {v.name} — completed {v.completedDate} — ${v.totalInvestment}
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

      <h3>Concurrency test (§9, weeks 12-13)</h3>
      <p>Fires N simultaneous createProject writes from this one tab, then checks every one landed with no field corruption.</p>
      <div style={{ display: 'flex', gap: 8 }}>
        <button onClick={() => runConcurrencyTest(10)} disabled={runningConcurrency || whoami.role !== 'write'}>
          {runningConcurrency ? 'Running…' : 'Run with 10 concurrent writes'}
        </button>
        <button onClick={() => runConcurrencyTest(20)} disabled={runningConcurrency || whoami.role !== 'write'}>
          {runningConcurrency ? 'Running…' : 'Run with 20 concurrent writes'}
        </button>
      </div>
      {concurrencyResult && (
        <p style={{ color: concurrencyResult.error || concurrencyResult.corrupted > 0 || concurrencyResult.landed < concurrencyResult.requested ? 'crimson' : 'green' }}>
          {concurrencyResult.error
            ? `Failed: ${concurrencyResult.error}`
            : `${concurrencyResult.landed}/${concurrencyResult.requested} landed, ${concurrencyResult.corrupted} corrupted, in ${concurrencyResult.elapsedMs}ms`}
        </p>
      )}
    </div>
  );
}
