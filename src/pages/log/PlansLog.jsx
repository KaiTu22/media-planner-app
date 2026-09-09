import { useEffect, useMemo, useState } from 'react';
import { jsonpRequest } from '../../api/appsScript';
import { SANDBOX_API_URL } from '../../api/config';

// §6.3 Plans Log (/log/plans) — every *completed* version (completedDate
// set, per §6.2 step 3), joined against its parent project for context.
// Derived/read-only, same as the Assignment Log — this is the productivity
// report; counts per planner fall out of filtering this view.
export default function PlansLog() {
  const [whoami, setWhoami] = useState(null);
  const [versions, setVersions] = useState([]);
  const [projectById, setProjectById] = useState({});
  const [status, setStatus] = useState('loading');
  const [error, setError] = useState(null);

  const [search, setSearch] = useState('');
  const [myPlansOnly, setMyPlansOnly] = useState(false);
  const [versionStatus, setVersionStatus] = useState('');
  const [completedFrom, setCompletedFrom] = useState('');
  const [completedTo, setCompletedTo] = useState('');

  useEffect(() => {
    Promise.all([
      jsonpRequest(SANDBOX_API_URL, { action: 'whoami' }),
      jsonpRequest(SANDBOX_API_URL, { action: 'listVersions' }),
      jsonpRequest(SANDBOX_API_URL, { action: 'listProjects' }),
    ])
      .then(([user, versionRows, projectRows]) => {
        setWhoami(user);
        setVersions(versionRows.filter((v) => v.completedDate));
        const map = {};
        projectRows.forEach((p) => { map[p.id] = p; });
        setProjectById(map);
        setStatus('done');
      })
      .catch((err) => {
        setError(err.message);
        setStatus('error');
      });
  }, []);

  const versionStatuses = useMemo(() => [...new Set(versions.map((v) => v.versionStatus).filter(Boolean))], [versions]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return versions.filter((v) => {
      const project = projectById[v.projectId];
      if (myPlansOnly && whoami && project?.leadMediaPlannerEmail !== whoami.email) return false;
      if (versionStatus && v.versionStatus !== versionStatus) return false;
      const completedDay = (v.completedDate || '').slice(0, 10);
      if (completedFrom && completedDay < completedFrom) return false;
      if (completedTo && completedDay > completedTo) return false;
      if (q) {
        const haystack = [v.name, project?.projectName, project?.account, project?.brand, project?.leadMediaPlannerEmail]
          .filter(Boolean).join(' ').toLowerCase();
        if (!haystack.includes(q)) return false;
      }
      return true;
    });
  }, [versions, projectById, search, myPlansOnly, whoami, versionStatus, completedFrom, completedTo]);

  if (status === 'loading') return <p>Loading plans…</p>;
  if (status === 'error') return <p style={{ color: 'crimson' }}>Failed: {error}</p>;

  return (
    <div>
      <h2>Plans Log ({filtered.length} of {versions.length})</h2>

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search version/project/account/brand/planner"
          style={{ minWidth: 260 }}
        />
        <label>
          <input type="checkbox" checked={myPlansOnly} onChange={(e) => setMyPlansOnly(e.target.checked)} /> My plans
        </label>
        <label>
          Version Status{' '}
          <select value={versionStatus} onChange={(e) => setVersionStatus(e.target.value)}>
            <option value="">All</option>
            {versionStatuses.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
        </label>
        <label>Completed from <input type="date" value={completedFrom} onChange={(e) => setCompletedFrom(e.target.value)} /></label>
        <label>Completed to <input type="date" value={completedTo} onChange={(e) => setCompletedTo(e.target.value)} /></label>
      </div>

      <div className="table-scroll">
      <table>
        <thead>
          <tr>
            <th>Version</th><th>Project</th><th>Account / Brand</th><th>Lead Planner</th>
            <th>Completed</th><th>Total Investment</th><th>Status</th><th>Folder</th>
          </tr>
        </thead>
        <tbody>
          {filtered.map((v) => {
            const project = projectById[v.projectId];
            const folderLink = v.folderId
              ? `https://drive.google.com/drive/folders/${v.folderId}`
              : project?.driveFolderLink;
            return (
              <tr key={v.id}>
                <td>{v.name}</td>
                <td>{project?.projectName}</td>
                <td>{project ? `${project.account} / ${project.brand}` : ''}</td>
                <td>{project?.leadMediaPlannerEmail}</td>
                <td>{(v.completedDate || '').slice(0, 10)}</td>
                <td>{v.totalInvestment != null ? `$${v.totalInvestment}` : ''}</td>
                <td>{v.versionStatus}</td>
                <td>{folderLink && <a className="btn-link" href={folderLink} target="_blank" rel="noreferrer">Open Folder</a>}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
      </div>
    </div>
  );
}
