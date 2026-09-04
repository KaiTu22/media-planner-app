import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { appsScriptPost, jsonpRequest, verifyByPolling } from '../api/appsScript';
import { SANDBOX_API_URL } from '../api/config';

// §6.6 Navigation at scale — the primary way to find and open a project,
// replacing the old Planner tool's own flat project list. Explorer-style:
// a folder tree (left) + a compact, sortable project table (right), with
// search working across the whole project set regardless of which folder
// is open. Folders here are the shared, backend-hosted version of the
// legacy tool's local-only projectFolders — everyone sees the same tree.
export default function Browse() {
  const [whoami, setWhoami] = useState(null);
  const [projects, setProjects] = useState([]);
  const [folders, setFolders] = useState([]);
  const [status, setStatus] = useState('loading');
  const [error, setError] = useState(null);

  const [selectedFolderId, setSelectedFolderId] = useState('__all__'); // '__all__' | '__uncategorized__' | a folder id
  const [expanded, setExpanded] = useState(() => new Set());
  const [search, setSearch] = useState('');
  const [sortBy, setSortBy] = useState('name'); // 'name' | 'created'

  const refresh = () => {
    setStatus('loading');
    Promise.all([
      jsonpRequest(SANDBOX_API_URL, { action: 'whoami' }),
      jsonpRequest(SANDBOX_API_URL, { action: 'listProjects' }),
      jsonpRequest(SANDBOX_API_URL, { action: 'listProjectFolders' }),
    ])
      .then(([user, projectRows, folderRows]) => {
        setWhoami(user);
        setProjects(projectRows);
        setFolders(folderRows);
        setStatus('done');
      })
      .catch((err) => {
        setError(err.message);
        setStatus('error');
      });
  };

  useEffect(refresh, []);

  const childrenByParent = useMemo(() => {
    const map = {};
    folders.forEach((f) => {
      const key = f.parentId || '__root__';
      if (!map[key]) map[key] = [];
      map[key].push(f);
    });
    return map;
  }, [folders]);

  const projectCountByFolder = useMemo(() => {
    const map = {};
    projects.forEach((p) => {
      const key = p.projectFolderId || '__uncategorized__';
      map[key] = (map[key] || 0) + 1;
    });
    return map;
  }, [projects]);

  const q = search.trim().toLowerCase();
  const visibleProjects = useMemo(() => {
    let rows;
    if (q) {
      // §6.6 — search works across the whole tree at once, not just the open folder.
      rows = projects.filter((p) => {
        const haystack = [p.projectName, p.account, p.brand, p.agency, p.leadMediaPlannerEmail]
          .filter(Boolean).join(' ').toLowerCase();
        return haystack.includes(q);
      });
    } else if (selectedFolderId === '__all__') {
      rows = projects;
    } else if (selectedFolderId === '__uncategorized__') {
      rows = projects.filter((p) => !p.projectFolderId);
    } else {
      rows = projects.filter((p) => p.projectFolderId === selectedFolderId);
    }
    const sorted = [...rows];
    if (sortBy === 'name') {
      sorted.sort((a, b) => (a.projectName || '').localeCompare(b.projectName || ''));
    } else {
      sorted.sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));
    }
    return sorted;
  }, [projects, q, selectedFolderId, sortBy]);

  const toggleExpanded = (folderId) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(folderId)) next.delete(folderId); else next.add(folderId);
      return next;
    });
  };

  // Optimistic updates throughout: Apps Script writes give no readable
  // response (X-Frame-Options blocks it), so confirming a write means
  // polling a follow-up read — a couple of seconds even when everything
  // works. Updating local state immediately and reconciling with the real
  // backend state in the background (rolling back only on actual failure)
  // makes the UI feel instant for the common case instead of visibly
  // lagging behind every click.
  const createFolder = async (parentId) => {
    const name = window.prompt('Name this folder:');
    if (!name || !name.trim()) return;
    const id = `folder-${Date.now()}`;
    const optimisticFolder = { id, name: name.trim(), parentId: parentId || null };
    setFolders((prev) => [...prev, optimisticFolder]);
    if (parentId) setExpanded((prev) => new Set(prev).add(parentId));
    try {
      await appsScriptPost(SANDBOX_API_URL, { action: 'createProjectFolder', payload: JSON.stringify(optimisticFolder) });
      await verifyByPolling(async () => {
        const rows = await jsonpRequest(SANDBOX_API_URL, { action: 'listProjectFolders' });
        if (rows.find((f) => f.id === id)) {
          setFolders(rows);
          return true;
        }
        return false;
      });
    } catch (err) {
      setFolders((prev) => prev.filter((f) => f.id !== id));
      window.alert(`Could not create folder: ${err.message}`);
    }
  };

  const renameFolder = async (folder) => {
    const name = window.prompt('Rename folder:', folder.name);
    if (!name || !name.trim() || name === folder.name) return;
    const previousName = folder.name;
    setFolders((prev) => prev.map((f) => (f.id === folder.id ? { ...f, name: name.trim() } : f)));
    try {
      await appsScriptPost(SANDBOX_API_URL, { action: 'renameProjectFolder', payload: JSON.stringify({ id: folder.id, name: name.trim() }) });
      await verifyByPolling(async () => {
        const rows = await jsonpRequest(SANDBOX_API_URL, { action: 'listProjectFolders' });
        if (rows.find((f) => f.id === folder.id && f.name === name.trim())) {
          setFolders(rows);
          return true;
        }
        return false;
      });
    } catch (err) {
      setFolders((prev) => prev.map((f) => (f.id === folder.id ? { ...f, name: previousName } : f)));
      window.alert(`Could not rename folder: ${err.message}`);
    }
  };

  const deleteFolder = async (folder) => {
    const count = projectCountByFolder[folder.id] || 0;
    const msg = count > 0
      ? `Delete "${folder.name}"? ${count} project${count !== 1 ? 's' : ''} inside will move to Uncategorized.`
      : `Delete "${folder.name}"?`;
    if (!window.confirm(msg)) return;
    const previousFolders = folders;
    const previousProjects = projects;
    setFolders((prev) => prev.filter((f) => f.id !== folder.id));
    setProjects((prev) => prev.map((p) => (p.projectFolderId === folder.id ? { ...p, projectFolderId: null } : p)));
    if (selectedFolderId === folder.id) setSelectedFolderId('__all__');
    try {
      await appsScriptPost(SANDBOX_API_URL, { action: 'deleteProjectFolder', payload: JSON.stringify({ id: folder.id }) });
      await verifyByPolling(async () => {
        const rows = await jsonpRequest(SANDBOX_API_URL, { action: 'listProjectFolders' });
        if (!rows.find((f) => f.id === folder.id)) {
          setFolders(rows);
          return true;
        }
        return false;
      });
      const freshProjects = await jsonpRequest(SANDBOX_API_URL, { action: 'listProjects' });
      setProjects(freshProjects);
    } catch (err) {
      setFolders(previousFolders);
      setProjects(previousProjects);
      window.alert(`Could not delete folder: ${err.message}`);
    }
  };

  const moveProjectToFolder = async (project, folderId) => {
    const previousFolderId = project.projectFolderId || null;
    setProjects((prev) => prev.map((p) => (p.id === project.id ? { ...p, projectFolderId: folderId || null } : p)));
    try {
      await appsScriptPost(SANDBOX_API_URL, { action: 'updateProject', payload: JSON.stringify({ id: project.id, projectFolderId: folderId || null }) });
      await verifyByPolling(async () => {
        const rows = await jsonpRequest(SANDBOX_API_URL, { action: 'listProjects' });
        const updated = rows.find((p) => p.id === project.id);
        if (updated && (updated.projectFolderId || null) === (folderId || null)) {
          setProjects(rows);
          return true;
        }
        return false;
      });
    } catch (err) {
      setProjects((prev) => prev.map((p) => (p.id === project.id ? { ...p, projectFolderId: previousFolderId } : p)));
      window.alert(`Could not move project: ${err.message}`);
    }
  };

  if (status === 'loading') return <p>Loading…</p>;
  if (status === 'error') return <p style={{ color: 'crimson' }}>Failed: {error}</p>;

  return (
    <div style={{ display: 'flex', gap: 16 }}>
      <aside style={{ width: 220, flexShrink: 0, borderRight: '1px solid #ddd', paddingRight: 12 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
          <strong>Folders</strong>
          <button onClick={() => createFolder(null)} title="New root folder">+</button>
        </div>
        <TreeNode
          label="All Projects"
          count={projects.length}
          active={selectedFolderId === '__all__'}
          onClick={() => setSelectedFolderId('__all__')}
        />
        <TreeNode
          label="Uncategorized"
          count={projectCountByFolder.__uncategorized__ || 0}
          active={selectedFolderId === '__uncategorized__'}
          onClick={() => setSelectedFolderId('__uncategorized__')}
        />
        <FolderList
          parentId={null}
          childrenByParent={childrenByParent}
          projectCountByFolder={projectCountByFolder}
          expanded={expanded}
          toggleExpanded={toggleExpanded}
          selectedFolderId={selectedFolderId}
          setSelectedFolderId={setSelectedFolderId}
          createFolder={createFolder}
          renameFolder={renameFolder}
          deleteFolder={deleteFolder}
        />
      </aside>

      <main style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', gap: 8, marginBottom: 12, alignItems: 'center' }}>
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search all projects…"
            style={{ minWidth: 260 }}
          />
          <label>
            Sort{' '}
            <select value={sortBy} onChange={(e) => setSortBy(e.target.value)}>
              <option value="name">A-Z</option>
              <option value="created">Newest first</option>
            </select>
          </label>
          <span style={{ color: '#888' }}>{visibleProjects.length} project{visibleProjects.length !== 1 ? 's' : ''}</span>
        </div>

        <table>
          <thead>
            <tr>
              <th>Project</th><th>Account / Brand</th><th>Lead Planner</th>
              <th>Status</th><th>Folder</th><th></th>
            </tr>
          </thead>
          <tbody>
            {visibleProjects.map((p) => (
              <tr key={p.id}>
                <td>{p.projectName}</td>
                <td>{p.account} / {p.brand}</td>
                <td>{p.leadMediaPlannerEmail}</td>
                <td>{p.mediaPlanStatus}</td>
                <td>
                  <select
                    value={p.projectFolderId || ''}
                    onChange={(e) => moveProjectToFolder(p, e.target.value || null)}
                  >
                    <option value="">Uncategorized</option>
                    {folders.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
                  </select>
                </td>
                <td><Link to={`/planner/${p.id}`}>Open in Planner</Link></td>
              </tr>
            ))}
          </tbody>
        </table>
      </main>
    </div>
  );
}

function TreeNode({ label, count, active, onClick, indent = 0, actions }) {
  return (
    <div
      onClick={onClick}
      style={{
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        padding: '4px 6px', paddingLeft: 6 + indent * 14, cursor: 'pointer', borderRadius: 4,
        background: active ? '#e0f2fe' : 'transparent', fontSize: '0.9rem',
      }}
    >
      <span>{label} <span style={{ color: '#888' }}>({count})</span></span>
      {actions}
    </div>
  );
}

function FolderList({ parentId, childrenByParent, projectCountByFolder, expanded, toggleExpanded, selectedFolderId, setSelectedFolderId, createFolder, renameFolder, deleteFolder, indent = 0 }) {
  const key = parentId || '__root__';
  const children = childrenByParent[key] || [];
  return (
    <>
      {children.map((folder) => (
        <div key={folder.id}>
          <TreeNode
            label={<>
              <span onClick={(e) => { e.stopPropagation(); toggleExpanded(folder.id); }} style={{ marginRight: 4 }}>
                {(childrenByParent[folder.id] || []).length > 0 ? (expanded.has(folder.id) ? '▾' : '▸') : '·'}
              </span>
              {folder.name}
            </>}
            count={projectCountByFolder[folder.id] || 0}
            active={selectedFolderId === folder.id}
            indent={indent}
            onClick={() => setSelectedFolderId(folder.id)}
            actions={
              <span style={{ display: 'flex', gap: 4 }}>
                <button onClick={(e) => { e.stopPropagation(); createFolder(folder.id); }} title="New subfolder" style={{ fontSize: '0.7rem' }}>+</button>
                <button onClick={(e) => { e.stopPropagation(); renameFolder(folder); }} title="Rename" style={{ fontSize: '0.7rem' }}>✎</button>
                <button onClick={(e) => { e.stopPropagation(); deleteFolder(folder); }} title="Delete" style={{ fontSize: '0.7rem' }}>✕</button>
              </span>
            }
          />
          {expanded.has(folder.id) && (
            <FolderList
              parentId={folder.id}
              childrenByParent={childrenByParent}
              projectCountByFolder={projectCountByFolder}
              expanded={expanded}
              toggleExpanded={toggleExpanded}
              selectedFolderId={selectedFolderId}
              setSelectedFolderId={setSelectedFolderId}
              createFolder={createFolder}
              renameFolder={renameFolder}
              deleteFolder={deleteFolder}
              indent={indent + 1}
            />
          )}
        </div>
      ))}
    </>
  );
}
