import { useEffect, useState } from 'react';
import { appsScriptPost, jsonpRequest, verifyByPolling } from '../api/appsScript';
import { SANDBOX_API_URL } from '../api/config';
import ProjectFormFields, { emptyProjectForm, loadProjectLookups } from './ProjectFormFields';

// §6.1 Assignment flow, as an overlay on the Log (confirmed 2026-09-10) —
// replaces the old standalone "Assignment" page/nav tab so the Log is the
// one place people land, with "+ New Assignment" opening this on top of it
// instead of navigating away. Creates a PROJECT record; pitchTeam/holdCo
// are derived server-side from pitchLeadName/agency (§5.1), and a Drive
// folder is auto-created (§5.2) — neither is user-editable here.
export default function NewAssignmentModal({ onClose, onCreated }) {
  const [lookups, setLookups] = useState(null);
  const [lookupError, setLookupError] = useState(null);
  const [form, setForm] = useState(emptyProjectForm);
  const [newShowName, setNewShowName] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [created, setCreated] = useState(null);

  useEffect(() => {
    loadProjectLookups().then(setLookups).catch((err) => setLookupError(err.message));
  }, []);

  const updateField = (field) => (e) => {
    const value = e.target.type === 'checkbox' ? e.target.checked
      : e.target.type === 'checkbox-list' ? e.target.value
      : e.target.value;
    setForm((f) => ({ ...f, [field]: value }));
  };

  const submit = async (e) => {
    e.preventDefault();
    if (!form.projectName.trim() || !form.account.trim()) return;
    setSaving(true);
    setError(null);
    const id = `proj-${Date.now()}`;
    try {
      await appsScriptPost(SANDBOX_API_URL, {
        action: 'createProject',
        payload: JSON.stringify({ id, ...form, notifyEmails: form.notifyEmails.join(',') }),
      });
      const project = await verifyByPolling(async () => {
        const rows = await jsonpRequest(SANDBOX_API_URL, { action: 'listProjects' });
        return rows.find((r) => r.id === id) || null;
      });
      setCreated(project);
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const done = () => {
    onCreated(created);
    onClose();
  };

  return (
    <div className="modal-overlay">
      <div className="modal-panel" style={{ maxWidth: 560 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
          <h2>{created ? 'Assignment created' : 'New Assignment'}</h2>
          <button onClick={onClose} className="modal-close">✕</button>
        </div>

        {lookupError && <p style={{ color: 'crimson' }}>Failed to load: {lookupError}</p>}
        {!lookups && !lookupError && <p>Loading…</p>}

        {lookups && !created && (
          <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <ProjectFormFields
              form={form}
              updateField={updateField}
              lookups={lookups}
              setLookups={setLookups}
              newShowName={newShowName}
              setNewShowName={setNewShowName}
            />
            {error && <p style={{ color: 'crimson' }}>Failed: {error}</p>}
            <div style={{ display: 'flex', gap: 8 }}>
              <button type="submit" disabled={saving}>{saving ? 'Creating…' : 'Create Assignment'}</button>
              <button type="button" onClick={onClose}>Cancel</button>
            </div>
          </form>
        )}

        {created && (
          <div>
            <p><strong>{created.projectName}</strong> was created and assigned.</p>
            <p style={{ color: 'var(--text-muted)' }}>
              Pitch Team: {created.pitchTeam || '(none)'} · Hold Co: {created.holdCo || '(none)'}
            </p>
            {created.driveFolderLink && (
              <p><a href={created.driveFolderLink} target="_blank" rel="noreferrer">Open Drive folder ↗</a></p>
            )}
            <button onClick={done} style={{ marginTop: 8 }}>Done</button>
          </div>
        )}
      </div>
    </div>
  );
}
