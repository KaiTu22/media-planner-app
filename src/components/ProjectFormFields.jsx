import { appsScriptPost, jsonpRequest, verifyByPolling } from '../api/appsScript';
import { SANDBOX_API_URL } from '../api/config';

export const DEAL_CATEGORIES = ['scatter', 'tentpole', 'upfront'];

export const emptyProjectForm = {
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
  notifyEmails: [], // picked from the Users list; joined to a comma string at submit (§6.1 step 5)
};

export function loadProjectLookups() {
  return Promise.all([
    jsonpRequest(SANDBOX_API_URL, { action: 'listUsers' }),
    jsonpRequest(SANDBOX_API_URL, { action: 'listTeamRoster' }),
    jsonpRequest(SANDBOX_API_URL, { action: 'listAgencyHoldCo' }),
    jsonpRequest(SANDBOX_API_URL, { action: 'listTentpoleShows' }),
  ]).then(([users, teamRoster, agencyHoldCo, tentpoleShows]) => ({ users, teamRoster, agencyHoldCo, tentpoleShows }));
}

// A date value coming back from the backend can be a full ISO timestamp
// (Sheets round-trips a date-only value through a real Date object) even
// though it was entered as just a date — <input type="date"> needs the
// plain YYYY-MM-DD slice or it won't populate.
export function toDateInputValue(value) {
  return (value || '').slice(0, 10);
}

// Shared between Assignment's create form and the Log's edit-details modal
// (confirmed 2026-09-09) — same field set, same lookup-derivation behavior
// (pitchTeam/holdCo auto-fill server-side), so the two can't drift apart.
export default function ProjectFormFields({ form, updateField, lookups, setLookups, newShowName, setNewShowName }) {
  const toggleNotifyEmail = (email) => (e) => {
    updateField('notifyEmails')({
      target: {
        type: 'checkbox-list',
        value: e.target.checked
          ? [...form.notifyEmails, email]
          : form.notifyEmails.filter((x) => x !== email),
      },
    });
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
        updateField('tentpoleShowId')({ target: { type: 'checkbox-list', value: id } });
        return true;
      }
      return false;
    });
    setNewShowName('');
  };

  return (
    <>
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

      <fieldset>
        <legend>Notify additional team members (§6.1 step 5)</legend>
        {lookups.users.map((u) => (
          <label key={u.email} style={{ display: 'block' }}>
            <input
              type="checkbox"
              checked={form.notifyEmails.includes(u.email)}
              onChange={toggleNotifyEmail(u.email)}
            />
            {' '}{u.name || u.email}
          </label>
        ))}
      </fieldset>

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
    </>
  );
}
