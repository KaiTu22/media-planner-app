import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { jsonpRequest } from '../../api/appsScript';
import { SANDBOX_API_URL } from '../../api/config';

// §6.3 Assignment Log (/log/projects) — a derived, read-only view over
// PROJECT records, not a separately maintained sheet. Filtering only, never
// an access restriction: any Write-role user can see and edit any project.
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

  const showNameById = useMemo(() => {
    const map = {};
    tentpoleShows.forEach((s) => { map[s.id] = s.name; });
    return map;
  }, [tentpoleShows]);

  const mediaPlanStatuses = useMemo(() => uniqueValues(projects, 'mediaPlanStatus'), [projects]);
  const dealStatuses = useMemo(() => uniqueValues(projects, 'dealStatus'), [projects]);
  const pitchTeams = useMemo(() => uniqueValues(projects, 'pitchTeam'), [projects]);
  const dealCategories = useMemo(() => uniqueValues(projects, 'dealCategory'), [projects]);

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
        <Select label="Media Plan Status" value={mediaPlanStatus} onChange={setMediaPlanStatus} options={mediaPlanStatuses} />
        <Select label="Deal Status" value={dealStatus} onChange={setDealStatus} options={dealStatuses} />
        <Select label="Pitch Team" value={pitchTeam} onChange={setPitchTeam} options={pitchTeams} />
        <Select label="Deal Category" value={dealCategory} onChange={setDealCategory} options={dealCategories} />
        <label>Due from <input type="date" value={dueFrom} onChange={(e) => setDueFrom(e.target.value)} /></label>
        <label>Due to <input type="date" value={dueTo} onChange={(e) => setDueTo(e.target.value)} /></label>
      </div>

      <table>
        <thead>
          <tr>
            <th>Project</th><th>Account / Brand</th><th>Agency</th><th>Pitch Team</th>
            <th>Lead Planner</th><th>Media Plan Status</th><th>Deal Status</th>
            <th>Deal Category</th><th>Tentpole Show</th><th>Plan Due</th><th>Folder</th><th></th>
          </tr>
        </thead>
        <tbody>
          {filtered.map((p) => (
            <tr key={p.id}>
              <td>{p.projectName}</td>
              <td>{p.account} / {p.brand}</td>
              <td>{p.agency}</td>
              <td>{p.pitchTeam}</td>
              <td>{p.leadMediaPlannerEmail}</td>
              <td>{p.mediaPlanStatus}</td>
              <td>{p.dealStatus}</td>
              <td>{p.dealCategory}</td>
              <td>{p.tentpoleShowId ? (showNameById[p.tentpoleShowId] || p.tentpoleShowId) : ''}</td>
              <td>{p.planDueDate}</td>
              <td>{p.driveFolderLink && <a href={p.driveFolderLink} target="_blank" rel="noreferrer">Open</a>}</td>
              <td><Link to={`/planner/${p.id}`}>Open in Planner</Link></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
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
