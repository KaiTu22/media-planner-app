import { useEffect, useState } from 'react';
import { appsScriptPost, jsonpRequest, verifyByPolling } from '../api/appsScript';
import { SANDBOX_API_URL } from '../api/config';
import ProjectFormFields, { loadProjectLookups, toDateInputValue } from './ProjectFormFields';

// Full editable record for one project — confirmed 2026-09-09, alongside
// slimming the Log table down to scannable columns (name/status/tags/due
// date/one action) so it actually fits on a laptop screen. Everything
// that used to need its own table column (Agency, Pitch Team, Deal
// Category, Tentpole Show, Drive Folder) lives here now, plus fields that
// had no edit UI anywhere before this (links, dates, additional team
// members) — Assignment only ever set these at creation time.
export default function ProjectDetailsModal({ project, onClose, onSaved }) {
  const [lookups, setLookups] = useState(null);
  const [lookupError, setLookupError] = useState(null);
  const [form, setForm] = useState(null);
  const [newShowName, setNewShowName] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    loadProjectLookups().then(setLookups).catch((err) => setLookupError(err.message));
    setForm({
      projectName: project.projectName || '',
      account: project.account || '',
      brand: project.brand || '',
      agency: project.agency || '',
      pitchLeadName: project.pitchLeadName || '',
      leadMediaPlannerEmail: project.leadMediaPlannerEmail || '',
      leadSellerEmail: project.leadSellerEmail || '',
      marketingProjectLead: project.marketingProjectLead || '',
      sponsorshipStrategyLead: project.sponsorshipStrategyLead || '',
      salesAccountManager: project.salesAccountManager || '',
      yieldContact: project.yieldContact || '',
      rushRequest: !!project.rushRequest,
      dealCategory: project.dealCategory || 'scatter',
      tentpoleShowId: project.tentpoleShowId || '',
      planRequestDate: toDateInputValue(project.planRequestDate),
      planDueDate: toDateInputValue(project.planDueDate),
      campaignStartDate: toDateInputValue(project.campaignStartDate),
      campaignEndDate: toDateInputValue(project.campaignEndDate),
      salesforceLink: project.salesforceLink || '',
      scratchpadLink: project.scratchpadLink || '',
      budgetSheetLink: project.budgetSheetLink || '',
      sponsorshipPlansLink: project.sponsorshipPlansLink || '',
      notifyEmails: (project.notifyEmails || '').split(',').map((e) => e.trim()).filter(Boolean),
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [project.id]);

  const updateField = (field) => (e) => {
    const value = e.target.type === 'checkbox' ? e.target.checked
      : e.target.type === 'checkbox-list' ? e.target.value
      : e.target.value;
    setForm((f) => ({ ...f, [field]: value }));
  };

  const save = async (e) => {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      await appsScriptPost(SANDBOX_API_URL, {
        action: 'updateProject',
        payload: JSON.stringify({ id: project.id, ...form, notifyEmails: form.notifyEmails.join(',') }),
      });
      const updated = await verifyByPolling(async () => {
        const rows = await jsonpRequest(SANDBOX_API_URL, { action: 'listProjects' });
        const row = rows.find((r) => r.id === project.id);
        // updateProject always stamps a fresh updatedAt server-side, so a
        // changed value reliably signals this specific write landed.
        return row && row.updatedAt !== project.updatedAt ? row : null;
      });
      onSaved(updated);
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(43,38,32,0.35)', display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: '40px 20px', overflowY: 'auto', zIndex: 100 }}>
      <div style={{ background: 'var(--surface)', borderRadius: 'var(--radius-card)', boxShadow: 'var(--shadow-card)', padding: 28, maxWidth: 560, width: '100%' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
          <h2>Edit Assignment</h2>
          <button onClick={onClose} style={{ border: 'none', background: 'none' }}>✕</button>
        </div>

        {lookupError && <p style={{ color: 'crimson' }}>Failed to load: {lookupError}</p>}
        {(!lookups || !form) && !lookupError && <p>Loading…</p>}

        {lookups && form && (
          <form onSubmit={save} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <ProjectFormFields
              form={form}
              updateField={updateField}
              lookups={lookups}
              setLookups={setLookups}
              newShowName={newShowName}
              setNewShowName={setNewShowName}
            />
            {project.driveFolderLink && (
              <p><a href={project.driveFolderLink} target="_blank" rel="noreferrer">Open Drive folder →</a></p>
            )}
            {error && <p style={{ color: 'crimson' }}>Failed: {error}</p>}
            <div style={{ display: 'flex', gap: 8 }}>
              <button type="submit" disabled={saving}>{saving ? 'Saving…' : 'Save Changes'}</button>
              <button type="button" onClick={onClose}>Cancel</button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
