import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { appsScriptPost, jsonpRequest, verifyByPolling } from '../api/appsScript';
import { SANDBOX_API_URL } from '../api/config';
import ProjectFormFields, { emptyProjectForm, loadProjectLookups } from '../components/ProjectFormFields';

// §6.1 Assignment flow — creates a PROJECT record. pitchTeam/holdCo are
// derived server-side from pitchLeadName/agency (§5.1), and a Drive folder
// is auto-created (§5.2); neither is user-editable here.
export default function Assignment() {
  const [lookups, setLookups] = useState(null);
  const [lookupError, setLookupError] = useState(null);
  const [form, setForm] = useState(emptyProjectForm);
  const [newShowName, setNewShowName] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [created, setCreated] = useState(null);

  const doLoadLookups = () => {
    setLookupError(null);
    loadProjectLookups().then(setLookups).catch((err) => setLookupError(err.message));
  };

  useEffect(doLoadLookups, []);

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
    setCreated(null);
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
      setForm(emptyProjectForm);
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  if (lookupError) {
    return (
      <div>
        <p style={{ color: 'crimson' }}>Failed to load: {lookupError}</p>
        <p>You may need to sign in to your Google account, then retry.</p>
        <button onClick={doLoadLookups}>Retry</button>
      </div>
    );
  }
  if (!lookups) return <p>Loading…</p>;

  return (
    <div>
      <h2>New Assignment</h2>
      <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: 12, maxWidth: 480 }}>
        <ProjectFormFields
          form={form}
          updateField={updateField}
          lookups={lookups}
          setLookups={setLookups}
          newShowName={newShowName}
          setNewShowName={setNewShowName}
        />
        <button type="submit" disabled={saving}>{saving ? 'Creating…' : 'Create Assignment'}</button>
      </form>

      {error && <p style={{ color: 'crimson' }}>Failed: {error}</p>}
      {created && (
        <div style={{ marginTop: 16, padding: 12, border: '1px solid #ccc' }}>
          <p><strong>Created: {created.projectName}</strong></p>
          <p>Pitch Team: {created.pitchTeam || '(none)'} | Hold Co: {created.holdCo || '(none)'}</p>
          <p>Media Plan Status: {created.mediaPlanStatus || 'Pre-Planning'}</p>
          {created.driveFolderLink && (
            <p><a href={created.driveFolderLink} target="_blank" rel="noreferrer">Drive folder</a></p>
          )}
          <p><Link to="/log/projects">View in Assignment Log →</Link></p>
        </div>
      )}
    </div>
  );
}
