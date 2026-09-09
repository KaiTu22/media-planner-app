import { useEffect, useState } from 'react';
import { appsScriptPost, jsonpRequest, verifyByPolling } from '../api/appsScript';
import { SANDBOX_API_URL } from '../api/config';
import ProjectFormFields, { formatDisplayDate, loadProjectLookups, toDateInputValue } from './ProjectFormFields';

// Full editable record for one project — confirmed 2026-09-09, alongside
// slimming the Log table down to scannable columns (name/status/tags/due
// date/one action) so it actually fits on a laptop screen. Everything
// that used to need its own table column (Agency, Pitch Team, Deal
// Category, Tentpole Show, Drive Folder) lives here now, plus fields that
// had no edit UI anywhere before this (links, dates, additional team
// members) — Assignment only ever set these at creation time.
//
// Opens read-only by default (confirmed 2026-09-09) — an explicit "Edit"
// action is required to change anything, rather than every field being
// immediately editable the moment the modal opens.
export default function ProjectDetailsModal({ project, onClose, onSaved }) {
  const [mode, setMode] = useState('view'); // 'view' | 'edit'
  const [lookups, setLookups] = useState(null);
  const [lookupError, setLookupError] = useState(null);
  const [form, setForm] = useState(null);
  const [newShowName, setNewShowName] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    loadProjectLookups().then(setLookups).catch((err) => setLookupError(err.message));
    setForm(projectToForm(project));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [project.id]);

  const updateField = (field) => (e) => {
    const value = e.target.type === 'checkbox' ? e.target.checked
      : e.target.type === 'checkbox-list' ? e.target.value
      : e.target.value;
    setForm((f) => ({ ...f, [field]: value }));
  };

  const startEdit = () => {
    setForm(projectToForm(project));
    setError(null);
    setMode('edit');
  };

  const cancelEdit = () => {
    setForm(projectToForm(project));
    setError(null);
    setMode('view');
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
      setMode('view');
      onSaved(updated);
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const userName = (email) => {
    const u = lookups?.users.find((x) => x.email === email);
    return u ? (u.name || u.email) : email;
  };
  const showName = (id) => lookups?.tentpoleShows.find((s) => s.id === id)?.name || id;

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(43,38,32,0.35)', display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: '40px 20px', overflowY: 'auto', zIndex: 100 }}>
      <div style={{ background: 'var(--surface)', borderRadius: 'var(--radius-card)', boxShadow: 'var(--shadow-card)', padding: 28, maxWidth: 560, width: '100%' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
          <h2>{mode === 'edit' ? 'Edit Assignment' : project.projectName}</h2>
          <button onClick={onClose} style={{ border: 'none', background: 'none' }}>✕</button>
        </div>

        {lookupError && <p style={{ color: 'crimson' }}>Failed to load: {lookupError}</p>}
        {(!lookups || !form) && !lookupError && <p>Loading…</p>}

        {lookups && form && mode === 'view' && (
          <div>
            <ViewRow label="Account / Brand" value={[project.account, project.brand].filter(Boolean).join(' / ')} />
            <ViewRow label="Agency (Hold Co)" value={[project.agency, project.holdCo && `(${project.holdCo})`].filter(Boolean).join(' ')} />
            <ViewRow label="Pitch Lead (Pitch Team)" value={[project.pitchLeadName, project.pitchTeam && `(${project.pitchTeam})`].filter(Boolean).join(' ')} />
            <ViewRow label="Lead Media Planner" value={project.leadMediaPlannerEmail && userName(project.leadMediaPlannerEmail)} />
            <ViewRow label="Lead Seller" value={project.leadSellerEmail} />
            <ViewRow label="Marketing Project Lead" value={project.marketingProjectLead} />
            <ViewRow label="Sponsorship Strategy Lead" value={project.sponsorshipStrategyLead} />
            <ViewRow label="Sales Account Manager" value={project.salesAccountManager} />
            <ViewRow label="Yield Contact" value={project.yieldContact} />
            <ViewRow label="Notify additional team members" value={(project.notifyEmails || '').split(',').map((e) => e.trim()).filter(Boolean).map(userName).join(', ')} />
            <ViewRow label="Rush Request" value={project.rushRequest ? 'Yes' : 'No'} />
            <ViewRow label="Deal Category" value={project.dealCategory} />
            {project.dealCategory === 'tentpole' && <ViewRow label="Tentpole Show" value={project.tentpoleShowId && showName(project.tentpoleShowId)} />}
            <ViewRow label="Plan Request Date" value={formatDisplayDate(project.planRequestDate)} />
            <ViewRow label="Plan Due Date" value={formatDisplayDate(project.planDueDate)} />
            <ViewRow label="Campaign Start" value={formatDisplayDate(project.campaignStartDate)} />
            <ViewRow label="Campaign End" value={formatDisplayDate(project.campaignEndDate)} />
            <ViewLinkRow label="Salesforce Link" href={project.salesforceLink} />
            <ViewLinkRow label="Scratchpad Link" href={project.scratchpadLink} />
            <ViewLinkRow label="Budget Sheet Link" href={project.budgetSheetLink} />
            <ViewLinkRow label="Sponsorship Plans Link" href={project.sponsorshipPlansLink} />
            <ViewLinkRow label="Drive Folder" href={project.driveFolderLink} />

            <div style={{ display: 'flex', gap: 8, marginTop: 20 }}>
              <button onClick={startEdit}>Edit</button>
              <button onClick={onClose}>Close</button>
            </div>
          </div>
        )}

        {lookups && form && mode === 'edit' && (
          <form onSubmit={save} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
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
              <button type="submit" disabled={saving}>{saving ? 'Saving…' : 'Save Changes'}</button>
              <button type="button" onClick={cancelEdit}>Cancel</button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}

function projectToForm(project) {
  return {
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
  };
}

function ViewRow({ label, value }) {
  if (!value) return null;
  return (
    <div style={{ display: 'flex', gap: 10, padding: '6px 0', borderBottom: '1px solid var(--border-soft)', fontSize: '0.88rem' }}>
      <span style={{ flex: '0 0 220px', color: 'var(--text-muted)', fontWeight: 600, fontSize: '0.82rem' }}>{label}</span>
      <span>{value}</span>
    </div>
  );
}

function ViewLinkRow({ label, href }) {
  if (!href) return null;
  return (
    <div style={{ display: 'flex', gap: 10, padding: '6px 0', borderBottom: '1px solid var(--border-soft)', fontSize: '0.88rem' }}>
      <span style={{ flex: '0 0 220px', color: 'var(--text-muted)', fontWeight: 600, fontSize: '0.82rem' }}>{label}</span>
      <a href={href} target="_blank" rel="noreferrer">{href} ↗</a>
    </div>
  );
}
