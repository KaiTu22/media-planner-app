import { useEffect, useState } from 'react';
import { appsScriptPost, jsonpRequest, verifyByPolling } from '../api/appsScript';
import { SANDBOX_API_URL } from '../api/config';

const DEAL_CATEGORIES = ['scatter', 'tentpole', 'upfront'];

const emptyForm = {
  projectName: '',
  account: '',
  brand: '',
  agency: '',
  pitchLeadName: '',
  leadMediaPlannerEmail: '',
  leadSellerEmail: '',
  marketingProjectLead: '',
  sponsorshipStrategyLead: '',
  salesAccountManager: '',
  yieldContact: '',
  rushRequest: false,
  dealCategory: 'scatter',
  tentpoleShowId: '',
  planRequestDate: '',
  planDueDate: '',
  campaignStartDate: '',
  campaignEndDate: '',
  salesforceLink: '',
  scratchpadLink: '',
  budgetSheetLink: '',
  sponsorshipPlansLink: '',
};

// §6.1 Assignment flow — creates a PROJECT record. pitchTeam/holdCo are
// derived server-side from pitchLeadName/agency (§5.1), and a Drive folder
// is auto-created (§5.2); neither is user-editable here.
export default function Assignment() {
  const [lookups, setLookups] = useState(null);
  const [lookupError, setLookupError] = useState(null);
  const [form, setForm] = useState(emptyForm);
  const [newShowName, setNewShowName] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [created, setCreated] = useState(null);

  const loadLookups = () => {
    setLookupError(null);
    Promise.all([
      jsonpRequest(SANDBOX_API_URL, { action: 'listUsers' }),
      jsonpRequest(SANDBOX_API_URL, { action: 'listTeamRoster' }),
      jsonpRequest(SANDBOX_API_URL, { action: 'listAgencyHoldCo' }),
      jsonpRequest(SANDBOX_API_URL, { action: 'listTentpoleShows' }),
    ])
      .then(([users, teamRoster, agencyHoldCo, tentpoleShows]) => {
        setLookups({ users, teamRoster, agencyHoldCo, tentpoleShows });
      })
      .catch((err) => setLookupError(err.message));
  };

  useEffect(loadLookups, []);

  const updateField = (field) => (e) => {
    const value = e.target.type === 'checkbox' ? e.target.checked : e.target.value;
    setForm((f) => ({ ...f, [field]: value }));
  };

  const addTentpoleShow = async () => {
    if (!newShowName.trim()) return;
    const id = `show-${Date.now()}`;
    await appsScriptPost(SANDBOX_API_URL, {
      action: 'createTentpoleShow',
      payload: JSON.stringify({ id, name: newShowName }),
    });
    await verifyByPolling(async () => {
      const shows = await jsonpRequest(SANDBOX_API_URL, { action: 'listTentpoleShows' });
      if (shows.find((s) => s.id === id)) {
        setLookups((l) => ({ ...l, tentpoleShows: shows }));
        setForm((f) => ({ ...f, tentpoleShowId: id }));
        return true;
      }
      return false;
    });
    setNewShowName('');
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
        payload: JSON.stringify({ id, ...form }),
      });
      const project = await verifyByPolling(async () => {
        const rows = await jsonpRequest(SANDBOX_API_URL, { action: 'listProjects' });
        return rows.find((r) => r.id === id) || null;
      });
      setCreated(project);
      setForm(emptyForm);
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
        <button onClick={loadLookups}>Retry</button>
      </div>
    );
  }
  if (!lookups) return <p>Loading…</p>;

  return (
    <div>
      <h2>New Assignment</h2>
      <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: 12, maxWidth: 480 }}>
        <label>
          Project name*
          <input value={form.projectName} onChange={updateField('projectName')} required />
        </label>
        <label>
          Account*
          <input value={form.account} onChange={updateField('account')} required />
        </label>
        <label>
          Brand
          <input value={form.brand} onChange={updateField('brand')} />
        </label>
        <label>
          Agency (Hold Co auto-fills)
          <input list="agency-options" value={form.agency} onChange={updateField('agency')} />
          <datalist id="agency-options">
            {lookups.agencyHoldCo.map((a) => <option key={a.agency} value={a.agency} />)}
          </datalist>
        </label>
        <label>
          Pitch Lead (Pitch Team auto-fills)
          <select value={form.pitchLeadName} onChange={updateField('pitchLeadName')}>
            <option value="">—</option>
            {lookups.teamRoster.map((t) => <option key={t.teamMemberName} value={t.teamMemberName}>{t.teamMemberName}</option>)}
          </select>
        </label>
        <label>
          Lead Media Planner
          <select value={form.leadMediaPlannerEmail} onChange={updateField('leadMediaPlannerEmail')}>
            <option value="">—</option>
            {lookups.users.map((u) => <option key={u.email} value={u.email}>{u.name || u.email}</option>)}
          </select>
        </label>

        <details>
          <summary>Additional team members</summary>
          <label>Lead Seller <input value={form.leadSellerEmail} onChange={updateField('leadSellerEmail')} /></label>
          <label>Marketing Project Lead <input value={form.marketingProjectLead} onChange={updateField('marketingProjectLead')} /></label>
          <label>Sponsorship Strategy Lead <input value={form.sponsorshipStrategyLead} onChange={updateField('sponsorshipStrategyLead')} /></label>
          <label>Sales Account Manager <input value={form.salesAccountManager} onChange={updateField('salesAccountManager')} /></label>
          <label>Yield Contact <input value={form.yieldContact} onChange={updateField('yieldContact')} /></label>
        </details>

        <label>
          <input type="checkbox" checked={form.rushRequest} onChange={updateField('rushRequest')} /> Rush Request
        </label>

        <label>
          Deal Category
          <select value={form.dealCategory} onChange={updateField('dealCategory')}>
            {DEAL_CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        </label>

        {form.dealCategory === 'tentpole' && (
          <label>
            Tentpole Show
            <select value={form.tentpoleShowId} onChange={updateField('tentpoleShowId')}>
              <option value="">—</option>
              {lookups.tentpoleShows.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
            <div style={{ display: 'flex', gap: 4, marginTop: 4 }}>
              <input value={newShowName} onChange={(e) => setNewShowName(e.target.value)} placeholder="Add new show" />
              <button type="button" onClick={addTentpoleShow}>Add</button>
            </div>
          </label>
        )}

        <label>Plan Request Date <input type="date" value={form.planRequestDate} onChange={updateField('planRequestDate')} /></label>
        <label>Plan Due Date <input type="date" value={form.planDueDate} onChange={updateField('planDueDate')} /></label>
        <label>Campaign Start Date <input type="date" value={form.campaignStartDate} onChange={updateField('campaignStartDate')} /></label>
        <label>Campaign End Date <input type="date" value={form.campaignEndDate} onChange={updateField('campaignEndDate')} /></label>

        <label>Salesforce Link <input value={form.salesforceLink} onChange={updateField('salesforceLink')} /></label>
        <label>Scratchpad Link <input value={form.scratchpadLink} onChange={updateField('scratchpadLink')} /></label>
        <label>Budget Sheet Link <input value={form.budgetSheetLink} onChange={updateField('budgetSheetLink')} /></label>
        <label>Sponsorship Plans Link <input value={form.sponsorshipPlansLink} onChange={updateField('sponsorshipPlansLink')} /></label>

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
        </div>
      )}
    </div>
  );
}
