import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { appsScriptPost, jsonpRequest, verifyByPolling } from '../../api/appsScript';
import { SANDBOX_API_URL } from '../../api/config';

// §6.2 step 4 / step 5 — Media Plan Status progresses Pre-Planning -> Info
// Pending -> In Progress -> (Revision in Progress ->) Complete; Deal Status
// is a separate, independent field set once the deal actually resolves.
const MEDIA_PLAN_STATUSES = ['Pre-Planning', 'Info Pending', 'In Progress', 'Revision in Progress', 'Complete'];
const DEAL_STATUSES = ['Won', 'Lost', 'Cancelled', 'Client Review'];

// §6.3 Assignment Log (/log/projects) — a derived, read-only view over
// PROJECT records, not a separately maintained sheet. Filtering only, never
// an access restriction: any Write-role user can see and edit any project —
// so status is editable inline here for everyone, not just the assigned
// planner. "My Assignments" (confirmed 2026-09-08) is a pinned shortcut to
// find your own work quickly, not a permission boundary.
export default function ProjectsLog() {
  const [whoami, setWhoami] = useState(null);
  const [projects, setProjects] = useState([]);
  const [tentpoleShows, setTentpoleShows] = useState([]);
  const [status, setStatus] = useState('loading');
  const [error, setError] = useState(null);

  const [search, setSearch] = useState('');
  const [myProjectsOnly, setMyProjectsOnly] = useState(false);
  const [mediaPlanStatus, setMediaPlanStatus] = useState('');
  const [dealStatus, setDealStatus] = useState('');
  const [pitchTeam, setPitchTeam] = useState('');
  const [dealCategory, setDealCategory] = useState('');
  const [dueFrom, setDueFrom] = useState('');
  const [dueTo, setDueTo] = useState('');

  useEffect(() => {
    Promise.all([
      jsonpRequest(SANDBOX_API_URL, { action: 'whoami' }),
      jsonpRequest(SANDBOX_API_URL, { action: 'listProjects' }),
      jsonpRequest(SANDBOX_API_URL, { action: 'listTentpoleShows' }),
    ])
      .then(([user, projectRows, shows]) => {
        setWhoami(user);
        setProjects(projectRows);
        setTentpoleShows(shows);
        setStatus('done');
      })
      .catch((err) => {
        setError(err.message);
        setStatus('error');
      });
  }, []);

  // Optimistic, targeted updates only — never replace the whole `projects`
  // array from a follow-up fetch inside the verify step. An earlier version
  // of Browse did that and two edits in flight close together would
  // silently clobber each other's still-pending state (confirmed 2026-09-08).
  const updateProjectField = async (project, field, value) => {
    const previousValue = project[field] || null;
    setProjects((prev) => prev.map((p) => (p.id === project.id ? { ...p, [field]: value || null } : p)));
    try {
      await appsScriptPost(SANDBOX_API_URL, { action: 'updateProject', payload: JSON.stringify({ id: project.id, [field]: value || null }) });
      await verifyByPolling(async () => {
        const rows = await jsonpRequest(SANDBOX_API_URL, { action: 'listProjects' });
        const updated = rows.find((p) => p.id === project.id);
        return !!updated && (updated[field] || null) === (value || null);
      });
    } catch (err) {
      setProjects((prev) => prev.map((p) => (p.id === project.id ? { ...p, [field]: previousValue } : p)));
      window.alert(`Could not update ${field}: ${err.message}`);
    }
  };

  const showNameById = useMemo(() => {
    const map = {};
    tentpoleShows.forEach((s) => { map[s.id] = s.name; });
    return map;
  }, [tentpoleShows]);

  const pitchTeams = useMemo(() => uniqueValues(projects, 'pitchTeam'), [projects]);
  const dealCategories = useMemo(() => uniqueValues(projects, 'dealCategory'), [projects]);

  const myOpenAssignments = useMemo(() => {
    if (!whoami) return [];
    return projects.filter((p) => p.leadMediaPlannerEmail === whoami.email && p.mediaPlanStatus !== 'Complete');
  }, [projects, whoami]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return projects.filter((p) => {
      if (myProjectsOnly && whoami && p.leadMediaPlannerEmail !== whoami.email) return false;
      if (mediaPlanStatus && p.mediaPlanStatus !== mediaPlanStatus) return false;
      if (dealStatus && p.dealStatus !== dealStatus) return false;
      if (pitchTeam && p.pitchTeam !== pitchTeam) return false;
      if (dealCategory && p.dealCategory !== dealCategory) return false;
      if (dueFrom && (!p.planDueDate || p.planDueDate < dueFrom)) return false;
      if (dueTo && (!p.planDueDate || p.planDueDate > dueTo)) return false;
      if (q) {
        const haystack = [p.projectName, p.account, p.brand, p.agency, p.leadMediaPlannerEmail]
          .filter(Boolean).join(' ').toLowerCase();
        if (!haystack.includes(q)) return false;
      }
      return true;
    });
  }, [projects, search, myProjectsOnly, whoami, mediaPlanStatus, dealStatus, pitchTeam, dealCategory, dueFrom, dueTo]);

  if (status === 'loading') return <p>Loading projects…</p>;
  if (status === 'error') return <p style={{ color: 'crimson' }}>Failed: {error}</p>;

  return (
    <div>
      {myOpenAssignments.length > 0 && (
        <div style={{ marginBottom: 24, padding: 12, background: '#f0f9ff', border: '1px solid #bae6fd', borderRadius: 6 }}>
          <h3 style={{ marginTop: 0 }}>My Open Assignments ({myOpenAssignments.length})</h3>
          <ProjectTable
            projects={myOpenAssignments}
            showNameById={showNameById}
            updateProjectField={updateProjectField}
          />
        </div>
      )}

      <h2>Assignment Log ({filtered.length} of {projects.length})</h2>

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search project/account/brand/agency/planner"
          style={{ minWidth: 260 }}
        />
        <label>
          <input type="checkbox" checked={myProjectsOnly} onChange={(e) => setMyProjectsOnly(e.target.checked)} /> My projects
        </label>
        <Select label="Media Plan Status" value={mediaPlanStatus} onChange={setMediaPlanStatus} options={MEDIA_PLAN_STATUSES} />
        <Select label="Deal Status" value={dealStatus} onChange={setDealStatus} options={DEAL_STATUSES} />
        <Select label="Pitch Team" value={pitchTeam} onChange={setPitchTeam} options={pitchTeams} />
        <Select label="Deal Category" value={dealCategory} onChange={setDealCategory} options={dealCategories} />
        <label>Due from <input type="date" value={dueFrom} onChange={(e) => setDueFrom(e.target.value)} /></label>
        <label>Due to <input type="date" value={dueTo} onChange={(e) => setDueTo(e.target.value)} /></label>
      </div>

      <ProjectTable
        projects={filtered}
        showNameById={showNameById}
        updateProjectField={updateProjectField}
      />
    </div>
  );
}

function ProjectTable({ projects, showNameById, updateProjectField }) {
  return (
    <table>
      <thead>
        <tr>
          <th>Project</th><th>Account / Brand</th><th>Agency</th><th>Pitch Team</th>
          <th>Lead Planner</th><th>Media Plan Status</th><th>Deal Status</th>
          <th>Deal Category</th><th>Tentpole Show</th><th>Plan Due</th><th>Folder</th><th></th>
        </tr>
      </thead>
      <tbody>
        {projects.map((p) => (
          <tr key={p.id}>
            <td>{p.projectName}</td>
            <td>{p.account} / {p.brand}</td>
            <td>{p.agency}</td>
            <td>{p.pitchTeam}</td>
            <td>{p.leadMediaPlannerEmail}</td>
            <td>
              <select value={p.mediaPlanStatus || ''} onChange={(e) => updateProjectField(p, 'mediaPlanStatus', e.target.value)}>
                {MEDIA_PLAN_STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
            </td>
            <td>
              <select value={p.dealStatus || ''} onChange={(e) => updateProjectField(p, 'dealStatus', e.target.value)}>
                <option value="">—</option>
                {DEAL_STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
            </td>
            <td>{p.dealCategory}</td>
            <td>{p.tentpoleShowId ? (showNameById[p.tentpoleShowId] || p.tentpoleShowId) : ''}</td>
            <td>{p.planDueDate}</td>
            <td>{p.driveFolderLink && <a href={p.driveFolderLink} target="_blank" rel="noreferrer">Open</a>}</td>
            <td><Link to={`/planner/${p.id}`}>Open in Planner</Link></td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function uniqueValues(rows, field) {
  return [...new Set(rows.map((r) => r[field]).filter(Boolean))];
}

function Select({ label, value, onChange, options }) {
  return (
    <label>
      {label}{' '}
      <select value={value} onChange={(e) => onChange(e.target.value)}>
        <option value="">All</option>
        {options.map((o) => <option key={o} value={o}>{o}</option>)}
      </select>
    </label>
  );
}
