import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { appsScriptPost, jsonpRequest, verifyByPolling } from '../../api/appsScript';
import { SANDBOX_API_URL } from '../../api/config';
import NewAssignmentModal from '../../components/NewAssignmentModal';
import ProjectDetailsModal from '../../components/ProjectDetailsModal';
import { formatDisplayDate } from '../../components/ProjectFormFields';

// §6.2 step 4 / step 5 — Media Plan Status progresses Pre-Planning -> Info
// Pending -> In Progress -> (Revision in Progress ->) Complete; Deal Status
// is a separate, independent field set once the deal actually resolves.
const MEDIA_PLAN_STATUSES = ['Pre-Planning', 'Info Pending', 'In Progress', 'Revision in Progress', 'Complete'];
const DEAL_STATUSES = ['Won', 'Lost', 'Cancelled', 'Client Review'];

// Status color coding (confirmed 2026-09-10) — lets someone scanning the
// whole log spot at-a-glance state without reading every cell.
const MEDIA_PLAN_STATUS_COLORS = {
  'Pre-Planning': { bg: '#EAE2D6', fg: '#57503F' },
  'Info Pending': { bg: '#DCEBFF', fg: '#0052CC' },
  'In Progress': { bg: '#FAE1E6', fg: '#C24463' },
  'Revision in Progress': { bg: '#FAE1E6', fg: '#C24463' },
  'Complete': { bg: '#E4F5F2', fg: '#0E9F8E' },
};
const DEAL_STATUS_COLORS = {
  'Won': { bg: '#E4F5F2', fg: '#0E9F8E' },
  'Lost': { bg: '#FAE9EE', fg: '#C24463' },
  'Client Review': { bg: '#EAE2D6', fg: '#57503F' },
  'Cancelled': { bg: '#2B2620', fg: '#FFFFFF' },
};
function statusStyle(map, value) {
  const c = map[value];
  return c ? { background: c.bg, color: c.fg, fontWeight: 600 } : undefined;
}

// §6.3 Assignment Log (/log/projects) — a derived, read-only view over
// PROJECT records, not a separately maintained sheet. Filtering only, never
// an access restriction: any Write-role user can see and edit any project —
// so status is editable inline here for everyone, not just the assigned
// planner. "My Assignments" (confirmed 2026-09-08) is a pinned shortcut to
// find your own work quickly, not a permission boundary.
//
// Tags (confirmed 2026-09-08) replace the retired Browse page's folder
// tree — a managed vocabulary (not free-form) for ad hoc, overlapping
// groupings ("Q1" + "Tentpole" + "Priority" at once) that a single-parent
// folder hierarchy couldn't represent. This consolidates "find/organize a
// project" into one page instead of two overlapping ones.
//
// Table columns kept intentionally minimal (confirmed 2026-09-09, real
// screenshot showed the table wider than the page even after a density
// pass): Agency, Pitch Team, Deal Category, Tentpole Show, and the Drive
// Folder link all moved into the "Details" edit modal instead of being
// their own columns — which also finally gives editing access to fields
// (links, dates, additional team members) that had no edit UI anywhere
// before this, since Assignment only ever set them once at creation.
export default function ProjectsLog() {
  const [whoami, setWhoami] = useState(null);
  const [projects, setProjects] = useState([]);
  const [tags, setTags] = useState([]);
  const [status, setStatus] = useState('loading');
  const [error, setError] = useState(null);
  const [editingProject, setEditingProject] = useState(null);
  const [showNewAssignment, setShowNewAssignment] = useState(false);

  const [search, setSearch] = useState('');
  const [myProjectsOnly, setMyProjectsOnly] = useState(false);
  const [mediaPlanStatus, setMediaPlanStatus] = useState('');
  const [dealStatus, setDealStatus] = useState('');
  const [pitchTeam, setPitchTeam] = useState('');
  const [dealCategory, setDealCategory] = useState('');
  const [tagFilter, setTagFilter] = useState('');
  const [dueFrom, setDueFrom] = useState('');
  const [dueTo, setDueTo] = useState('');

  const refresh = () => {
    setStatus('loading');
    Promise.all([
      jsonpRequest(SANDBOX_API_URL, { action: 'whoami' }),
      jsonpRequest(SANDBOX_API_URL, { action: 'listProjects' }),
      jsonpRequest(SANDBOX_API_URL, { action: 'listTags' }),
    ])
      .then(([user, projectRows, tagRows]) => {
        setWhoami(user);
        setProjects(projectRows);
        setTags(tagRows);
        setStatus('done');
      })
      .catch((err) => {
        setError(err.message);
        setStatus('error');
      });
  };

  useEffect(refresh, []);

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

  const projectTagList = (project) => (project.tags || '').split(',').map((t) => t.trim()).filter(Boolean);

  const addTagToProject = (project, tagName) => {
    if (!tagName) return;
    const current = projectTagList(project);
    if (current.includes(tagName)) return;
    updateProjectField(project, 'tags', [...current, tagName].join(','));
  };

  const removeTagFromProject = (project, tagName) => {
    const current = projectTagList(project);
    updateProjectField(project, 'tags', current.filter((t) => t !== tagName).join(','));
  };

  const deleteProject = async (project) => {
    if (!window.confirm(`Delete "${project.projectName}"? This removes it and its versions from the Log — it does NOT delete the Drive folder.`)) return;
    const previous = projects;
    setProjects((prev) => prev.filter((p) => p.id !== project.id));
    try {
      await appsScriptPost(SANDBOX_API_URL, { action: 'deleteProject', payload: JSON.stringify({ id: project.id }) });
      await verifyByPolling(async () => {
        const rows = await jsonpRequest(SANDBOX_API_URL, { action: 'listProjects' });
        return !rows.some((p) => p.id === project.id);
      });
    } catch (err) {
      setProjects(previous);
      window.alert(`Could not delete project: ${err.message}`);
    }
  };

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
      if (tagFilter && !projectTagList(p).includes(tagFilter)) return false;
      if (dueFrom && (!p.planDueDate || p.planDueDate < dueFrom)) return false;
      if (dueTo && (!p.planDueDate || p.planDueDate > dueTo)) return false;
      if (q) {
        const haystack = [p.projectName, p.account, p.brand, p.agency, p.leadMediaPlannerEmail]
          .filter(Boolean).join(' ').toLowerCase();
        if (!haystack.includes(q)) return false;
      }
      return true;
    });
  }, [projects, search, myProjectsOnly, whoami, mediaPlanStatus, dealStatus, pitchTeam, dealCategory, tagFilter, dueFrom, dueTo]);

  if (status === 'loading') return <p>Loading projects…</p>;
  if (status === 'error') return <p style={{ color: 'crimson' }}>Failed: {error}</p>;

  return (
    <div>
      {myOpenAssignments.length > 0 && (
        <div style={{ marginBottom: 16, padding: '10px 14px', background: 'rgba(0, 100, 255, 0.045)', border: '1px solid rgba(0, 100, 255, 0.16)', borderRadius: 'var(--radius-control)' }}>
          <h3 style={{ marginTop: 0, color: 'var(--primary)' }}>My Open Assignments ({myOpenAssignments.length})</h3>
          <ProjectTable
            projects={myOpenAssignments}
            tags={tags}
            updateProjectField={updateProjectField}
            addTagToProject={addTagToProject}
            removeTagFromProject={removeTagFromProject}
            onEdit={setEditingProject}
            onDelete={deleteProject}
          />
        </div>
      )}

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', flexWrap: 'wrap', gap: 8 }}>
        <h2>Assignment Log ({filtered.length} of {projects.length})</h2>
        <button onClick={() => setShowNewAssignment(true)}>+ New Assignment</button>
      </div>

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 10 }}>
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search project/account/brand/agency/planner"
          style={{ minWidth: 240 }}
        />
        <label style={{ display: 'flex', alignItems: 'center', gap: 4, fontWeight: 400 }}>
          <input type="checkbox" checked={myProjectsOnly} onChange={(e) => setMyProjectsOnly(e.target.checked)} /> My projects
        </label>
        <Select label="Media Plan Status" value={mediaPlanStatus} onChange={setMediaPlanStatus} options={MEDIA_PLAN_STATUSES} />
        <Select label="Deal Status" value={dealStatus} onChange={setDealStatus} options={DEAL_STATUSES} />
        <Select label="Pitch Team" value={pitchTeam} onChange={setPitchTeam} options={pitchTeams} />
        <Select label="Deal Category" value={dealCategory} onChange={setDealCategory} options={dealCategories} />
        <Select label="Tag" value={tagFilter} onChange={setTagFilter} options={tags.map((t) => t.name)} />
        <label>Due from <input type="date" value={dueFrom} onChange={(e) => setDueFrom(e.target.value)} /></label>
        <label>Due to <input type="date" value={dueTo} onChange={(e) => setDueTo(e.target.value)} /></label>
      </div>

      <ProjectTable
        projects={filtered}
        tags={tags}
        updateProjectField={updateProjectField}
        addTagToProject={addTagToProject}
        removeTagFromProject={removeTagFromProject}
        onEdit={setEditingProject}
        onDelete={deleteProject}
      />

      {editingProject && (
        <ProjectDetailsModal
          project={editingProject}
          onClose={() => setEditingProject(null)}
          onSaved={(updated) => {
            setProjects((prev) => prev.map((p) => (p.id === updated.id ? updated : p)));
            setEditingProject(null);
          }}
        />
      )}

      {showNewAssignment && (
        <NewAssignmentModal
          onClose={() => setShowNewAssignment(false)}
          onCreated={(project) => setProjects((prev) => [...prev, project])}
        />
      )}
    </div>
  );
}

function ProjectTable({ projects, tags, updateProjectField, addTagToProject, removeTagFromProject, onEdit, onDelete }) {
  const tagColor = (name) => tags.find((t) => t.name === name)?.color || '#8A8271';
  return (
    <div className="table-scroll">
    <table>
      <thead>
        <tr>
          <th>Project</th><th>Account / Brand</th>
          <th>Lead Planner</th><th>Media Plan Status</th><th>Deal Status</th>
          <th>Tags</th><th>Date Assigned</th><th>Plan Due</th><th></th><th></th><th></th>
        </tr>
      </thead>
      <tbody>
        {projects.map((p) => {
          const projectTags = (p.tags || '').split(',').map((t) => t.trim()).filter(Boolean);
          const availableTags = tags.filter((t) => !projectTags.includes(t.name));
          return (
            <tr key={p.id}>
              <td>{p.projectName}</td>
              <td>{p.account} / {p.brand}</td>
              <td>{p.leadMediaPlannerEmail}</td>
              <td>
                <select
                  value={p.mediaPlanStatus || ''}
                  onChange={(e) => updateProjectField(p, 'mediaPlanStatus', e.target.value)}
                  style={statusStyle(MEDIA_PLAN_STATUS_COLORS, p.mediaPlanStatus)}
                >
                  {MEDIA_PLAN_STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
                </select>
              </td>
              <td>
                <select
                  value={p.dealStatus || ''}
                  onChange={(e) => updateProjectField(p, 'dealStatus', e.target.value)}
                  style={statusStyle(DEAL_STATUS_COLORS, p.dealStatus)}
                >
                  <option value="">—</option>
                  {DEAL_STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
                </select>
              </td>
              <td>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, alignItems: 'center' }}>
                  {projectTags.map((tagName) => (
                    <span key={tagName} style={{ display: 'inline-flex', alignItems: 'center', gap: 3, background: `${tagColor(tagName)}1a`, color: tagColor(tagName), borderRadius: 100, padding: '1px 7px', fontSize: '0.74rem', fontWeight: 600 }}>
                      {tagName}
                      <button onClick={() => removeTagFromProject(p, tagName)} title="Remove tag" style={{ padding: 0, border: 'none', background: 'none', color: 'inherit', fontSize: '0.7rem', lineHeight: 1 }}>✕</button>
                    </span>
                  ))}
                  {availableTags.length > 0 && (
                    <select value="" onChange={(e) => addTagToProject(p, e.target.value)} style={{ minWidth: 80, fontSize: '0.74rem', padding: '2px 6px' }}>
                      <option value="">+ tag</option>
                      {availableTags.map((t) => <option key={t.id} value={t.name}>{t.name}</option>)}
                    </select>
                  )}
                </div>
              </td>
              <td>{formatDisplayDate(p.createdAt)}</td>
              <td>{formatDisplayDate(p.planDueDate)}</td>
              <td><button className="btn-link" onClick={() => onEdit(p)}>Details</button></td>
              <td><Link className="btn-link btn-link-primary" to={`/planner/${p.id}`}>Open Planner</Link></td>
              <td><button className="btn-link btn-link-danger" onClick={() => onDelete(p)} title="Delete project">Delete</button></td>
            </tr>
          );
        })}
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
    <label style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
      <span style={{ fontWeight: 400 }}>{label}</span>
      <select value={value} onChange={(e) => onChange(e.target.value)}>
        <option value="">All</option>
        {options.map((o) => <option key={o} value={o}>{o}</option>)}
      </select>
    </label>
  );
}
