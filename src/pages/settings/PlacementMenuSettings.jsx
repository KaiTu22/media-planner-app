import { useEffect, useMemo, useState } from 'react';
import { appsScriptPost, jsonpRequest, verifyByPolling } from '../../api/appsScript';
import { SANDBOX_API_URL } from '../../api/config';

// Placement Menu (confirmed 2026-09-23) — a curated, human-facing menu on
// top of the calc engine's existing fixed 14-value placementType enum
// (media-planner-tool's calculations.js), not a new categorization system.
// Every Category here is required to map to one of these 14 values, so
// picking a menu item in the Sponsorship Hub silently carries the correct
// revenue-type tag along with it, without the planner touching it.
const PLACEMENT_TYPES = [
  { value: 'TALENT_PRODUCTION', label: 'Talent and Production' },
  { value: 'PAID_MEDIA', label: 'Paid Media Distribution' },
  { value: 'CUSTOM_SOCIAL', label: 'Custom Social Package' },
  { value: 'DIGITAL_OO', label: 'Digital O&O' },
  { value: 'ADD_INNOVATION', label: 'Ad Innovation' },
  { value: 'ADDED_VALUE', label: 'Added Value' },
  { value: 'SOCIAL_VIDEO', label: 'Social Video' },
  { value: 'LINEAR_OO', label: 'Linear O&O' },
  { value: 'EXPERIENTIAL_FEE', label: 'Experiential – Fee' },
  { value: 'EXPERIENTIAL_BUILDOUT', label: 'Experiential Production Buildout' },
  { value: 'INTEGRATION_FEE', label: 'Integration – Fee' },
  { value: 'INTEGRATION_BUILDOUT', label: 'Integration Production Buildout' },
  { value: 'IP_LICENSING', label: 'IP / Licensing – Fee' },
  { value: 'BRAND_FUNDED_CONTENT', label: 'Brand Funded Content' },
];

const placementTypeLabel = (value) => PLACEMENT_TYPES.find((t) => t.value === value)?.label || value;

const emptyLine = () => ({ platform: '', description: '', size: '', costMethod: 'CPM', defaultRate: '' });

// Two real bundle shapes from the reference template (confirmed 2026-09-24):
// 'perLine' — each line carries its own rate, some intentionally blank
// ("bundled, no charge"), e.g. Billboard $36.50 + Pre-Roll (no charge) +
// Midroll $32.00. 'shared' — every line in the bundle is priced at one
// common rate, rather than forcing each line to either have its own rate
// or show as $0.
const RATE_MODES = [
  { value: 'perLine', label: 'Separate CPMs per line' },
  { value: 'shared', label: 'Shared CPM for all lines' },
];

const badgeStyle = {
  fontSize: '0.72rem',
  color: 'var(--text-muted)',
  background: 'var(--background)',
  border: '1px solid var(--border)',
  borderRadius: 999,
  padding: '2px 8px',
  whiteSpace: 'nowrap',
};

const modalOverlayStyle = {
  position: 'fixed',
  top: 0, left: 0, right: 0, bottom: 0,
  background: 'rgba(0,0,0,0.45)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  zIndex: 1000,
};

const modalCardStyle = {
  background: 'var(--surface)',
  borderRadius: 'var(--radius-control)',
  padding: 20,
  width: '90%',
  maxWidth: 420,
  boxShadow: '0 10px 40px rgba(0,0,0,0.3)',
};

function Modal({ title, onCancel, onSubmit, submitLabel, children }) {
  return (
    <div style={modalOverlayStyle} onClick={onCancel}>
      <div style={modalCardStyle} onClick={(e) => e.stopPropagation()}>
        <h3 style={{ marginTop: 0, marginBottom: 14 }}>{title}</h3>
        {children}
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 18 }}>
          <button className="btn-secondary" onClick={onCancel}>Cancel</button>
          <button onClick={onSubmit}>{submitLabel}</button>
        </div>
      </div>
    </div>
  );
}

export default function PlacementMenuSettings() {
  const [categories, setCategories] = useState([]);
  const [items, setItems] = useState([]);
  const [status, setStatus] = useState('loading');
  const [error, setError] = useState(null);

  // Collapsed by default — at 10 categories × 10 placements, showing
  // everything expanded at once is exactly the "flat, not ready for scale"
  // problem this redesign is fixing. A row expands only once the user asks.
  const [expandedCategories, setExpandedCategories] = useState(() => new Set());
  const [expandedItems, setExpandedItems] = useState(() => new Set());

  // Creating a category or placement now always happens in a small
  // centered overlay instead of an always-visible inline form at the
  // bottom of a (potentially very long) list.
  const [addCategoryOpen, setAddCategoryOpen] = useState(false);
  const [addCategoryName, setAddCategoryName] = useState('');
  const [addCategoryType, setAddCategoryType] = useState(PLACEMENT_TYPES[0].value);
  const [addPlacementForCategoryId, setAddPlacementForCategoryId] = useState(null);
  const [addPlacementName, setAddPlacementName] = useState('');

  const refresh = () => {
    setStatus('loading');
    Promise.all([
      jsonpRequest(SANDBOX_API_URL, { action: 'listPlacementCategories' }),
      jsonpRequest(SANDBOX_API_URL, { action: 'listPlacementMenuItems' }),
    ])
      .then(([categoryRows, itemRows]) => {
        // The backend replies with { error: '...' } (not an array) for an
        // action it doesn't recognize, e.g. a not-yet-deployed backend —
        // surface that as a real error instead of letting .map() crash the
        // whole page with no error boundary to catch it.
        if (!Array.isArray(categoryRows) || !Array.isArray(itemRows)) {
          throw new Error(categoryRows?.error || itemRows?.error || 'Unexpected response from the backend.');
        }
        setCategories(categoryRows);
        setItems(itemRows);
        setStatus('done');
      })
      .catch((err) => { setError(err.message); setStatus('error'); });
  };

  useEffect(refresh, []);

  const itemsByCategory = useMemo(() => {
    const map = {};
    categories.forEach((c) => { map[c.id] = []; });
    items.forEach((i) => { if (map[i.categoryId]) map[i.categoryId].push(i); });
    return map;
  }, [categories, items]);

  const toggleCategory = (id) => setExpandedCategories((prev) => {
    const next = new Set(prev);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });
  const toggleItem = (id) => setExpandedItems((prev) => {
    const next = new Set(prev);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });

  const openAddCategory = () => {
    setAddCategoryName('');
    setAddCategoryType(PLACEMENT_TYPES[0].value);
    setAddCategoryOpen(true);
  };

  const createCategory = async () => {
    const name = addCategoryName.trim();
    if (!name) { window.alert('Enter a category name first.'); return; }
    const id = `placement-category-${Date.now()}`;
    const placementType = addCategoryType;
    setCategories((prev) => [...prev, { id, name, placementType }]);
    setAddCategoryOpen(false);
    try {
      await appsScriptPost(SANDBOX_API_URL, { action: 'createPlacementCategory', payload: JSON.stringify({ id, name, placementType }) });
      await verifyByPolling(async () => {
        const rows = await jsonpRequest(SANDBOX_API_URL, { action: 'listPlacementCategories' });
        return rows.some((c) => c.id === id);
      });
      setExpandedCategories((prev) => new Set(prev).add(id));
    } catch (err) {
      setCategories((prev) => prev.filter((c) => c.id !== id));
      window.alert(`Could not add category: ${err.message}`);
    }
  };

  const renameCategory = async (category, name) => {
    const previous = categories;
    setCategories((prev) => prev.map((c) => (c.id === category.id ? { ...c, name } : c)));
    try {
      await appsScriptPost(SANDBOX_API_URL, { action: 'updatePlacementCategory', payload: JSON.stringify({ id: category.id, name }) });
      await verifyByPolling(async () => {
        const rows = await jsonpRequest(SANDBOX_API_URL, { action: 'listPlacementCategories' });
        return rows.find((c) => c.id === category.id)?.name === name;
      });
    } catch (err) {
      setCategories(previous);
      window.alert(`Could not rename category: ${err.message}`);
    }
  };

  const updateCategoryType = async (category, placementType) => {
    const previous = categories;
    setCategories((prev) => prev.map((c) => (c.id === category.id ? { ...c, placementType } : c)));
    try {
      await appsScriptPost(SANDBOX_API_URL, { action: 'updatePlacementCategory', payload: JSON.stringify({ id: category.id, placementType }) });
      await verifyByPolling(async () => {
        const rows = await jsonpRequest(SANDBOX_API_URL, { action: 'listPlacementCategories' });
        return rows.find((c) => c.id === category.id)?.placementType === placementType;
      });
    } catch (err) {
      setCategories(previous);
      window.alert(`Could not update revenue type: ${err.message}`);
    }
  };

  const deleteCategory = async (category) => {
    const childCount = (itemsByCategory[category.id] || []).length;
    const warning = childCount > 0
      ? `Delete "${category.name}"? Its ${childCount} placement${childCount === 1 ? '' : 's'} will also be deleted.`
      : `Delete "${category.name}"?`;
    if (!window.confirm(warning)) return;
    const previousCategories = categories;
    const previousItems = items;
    setCategories((prev) => prev.filter((c) => c.id !== category.id));
    setItems((prev) => prev.filter((i) => i.categoryId !== category.id));
    try {
      await appsScriptPost(SANDBOX_API_URL, { action: 'deletePlacementCategory', payload: JSON.stringify({ id: category.id }) });
      await verifyByPolling(async () => {
        const rows = await jsonpRequest(SANDBOX_API_URL, { action: 'listPlacementCategories' });
        return !rows.some((c) => c.id === category.id);
      });
    } catch (err) {
      setCategories(previousCategories);
      setItems(previousItems);
      window.alert(`Could not delete category: ${err.message}`);
    }
  };

  const openAddPlacement = (categoryId) => {
    setAddPlacementName('');
    setAddPlacementForCategoryId(categoryId);
  };

  const createItem = async () => {
    const categoryId = addPlacementForCategoryId;
    const name = addPlacementName.trim();
    if (!name) { window.alert('Enter a placement name first.'); return; }
    const id = `placement-item-${Date.now()}`;
    const lines = [emptyLine()];
    const rateMode = 'perLine';
    const sharedCostMethod = 'CPM';
    const sharedRate = '';
    setItems((prev) => [...prev, { id, categoryId, name, rateMode, sharedCostMethod, sharedRate, lines }]);
    setAddPlacementForCategoryId(null);
    try {
      await appsScriptPost(SANDBOX_API_URL, { action: 'createPlacementMenuItem', payload: JSON.stringify({ id, categoryId, name, rateMode, sharedCostMethod, sharedRate, lines }) });
      await verifyByPolling(async () => {
        const rows = await jsonpRequest(SANDBOX_API_URL, { action: 'listPlacementMenuItems' });
        return rows.some((i) => i.id === id);
      });
      setExpandedItems((prev) => new Set(prev).add(id));
    } catch (err) {
      setItems((prev) => prev.filter((i) => i.id !== id));
      window.alert(`Could not add placement: ${err.message}`);
    }
  };

  const renameItem = async (item, name) => {
    const previous = items;
    setItems((prev) => prev.map((i) => (i.id === item.id ? { ...i, name } : i)));
    try {
      await appsScriptPost(SANDBOX_API_URL, { action: 'updatePlacementMenuItem', payload: JSON.stringify({ id: item.id, name }) });
    } catch (err) {
      setItems(previous);
      window.alert(`Could not rename placement: ${err.message}`);
    }
  };

  const deleteItem = async (item) => {
    if (!window.confirm(`Delete "${item.name}"?`)) return;
    const previous = items;
    setItems((prev) => prev.filter((i) => i.id !== item.id));
    try {
      await appsScriptPost(SANDBOX_API_URL, { action: 'deletePlacementMenuItem', payload: JSON.stringify({ id: item.id }) });
    } catch (err) {
      setItems(previous);
      window.alert(`Could not delete placement: ${err.message}`);
    }
  };

  // Field edits (lines, rateMode, sharedCostMethod, sharedRate) are all
  // saved as a full-field replace — simpler and safer than trying to patch
  // a single array index server-side through the generic updateRecord_
  // helper, which only knows how to set whole field values.
  const saveItemPatch = async (item, patch) => {
    const previous = items;
    setItems((prev) => prev.map((i) => (i.id === item.id ? { ...i, ...patch } : i)));
    try {
      await appsScriptPost(SANDBOX_API_URL, { action: 'updatePlacementMenuItem', payload: JSON.stringify({ id: item.id, ...patch }) });
    } catch (err) {
      setItems(previous);
      window.alert(`Could not save placement: ${err.message}`);
    }
  };

  const addLine = (item) => saveItemPatch(item, { lines: [...item.lines, emptyLine()] });
  const removeLine = (item, idx) => saveItemPatch(item, { lines: item.lines.filter((_, i) => i !== idx) });
  const updateLine = (item, idx, field, value) => {
    const lines = item.lines.map((l, i) => (i === idx ? { ...l, [field]: value } : l));
    saveItemPatch(item, { lines });
  };
  // Persists the displayed defaults alongside rateMode itself — the Cost
  // Method select below shows item.sharedCostMethod || 'CPM' so it never
  // renders blank, but that fallback is display-only. Without writing the
  // real value here too, an item that's never had its shared fields
  // explicitly touched looks like "CPM" in Settings while actually saving
  // as blank to the backend — exactly what got copied into a package that
  // added this bundle before this fix.
  const updateItemRateMode = (item, rateMode) =>
    saveItemPatch(item, {
      rateMode,
      sharedCostMethod: item.sharedCostMethod || 'CPM',
      sharedRate: item.sharedRate || '',
    });
  const updateItemSharedCostMethod = (item, sharedCostMethod) => saveItemPatch(item, { sharedCostMethod });
  const updateItemSharedRate = (item, sharedRate) => saveItemPatch(item, { sharedRate });

  if (status === 'loading') return <p>Loading placement menu…</p>;
  if (status === 'error') return <p style={{ color: 'crimson' }}>Failed: {error}</p>;

  return (
    <div>
      <h2>Placement Menu</h2>
      <p style={{ color: 'var(--text-muted)', maxWidth: 640 }}>
        The organized menu planners pick from when building a Sponsorship Hub package, instead of typing everything by hand. Each Category maps to a Revenue Type (the calc engine's existing placement-type categorization) — every Placement under it inherits that mapping automatically. A Placement with more than one line is a bundle: picking it in the Hub adds every line at once (e.g. "Paramount Digital Package" adding a Billboard, Pre-Roll, and Midroll line together).
      </p>

      <div style={{ margin: '12px 0 20px' }}>
        <button onClick={openAddCategory}>+ Add category</button>
      </div>

      {categories.map((category) => {
        const categoryOpen = expandedCategories.has(category.id);
        const categoryItems = itemsByCategory[category.id] || [];
        return (
          <div key={category.id} style={{ border: '1px solid var(--border)', borderRadius: 'var(--radius-control)', marginBottom: 12, background: 'var(--surface)', maxWidth: 780 }}>
            <div
              onClick={() => toggleCategory(category.id)}
              style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', cursor: 'pointer' }}
            >
              <span style={{ fontSize: '0.75rem', width: 12, display: 'inline-block' }}>{categoryOpen ? '▾' : '▸'}</span>
              <span style={{ fontWeight: 700 }}>{category.name}</span>
              <span style={badgeStyle}>{placementTypeLabel(category.placementType)}</span>
              <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                {categoryItems.length} placement{categoryItems.length === 1 ? '' : 's'}
              </span>
              <button
                className="btn-link btn-link-danger"
                style={{ marginLeft: 'auto' }}
                onClick={(e) => { e.stopPropagation(); deleteCategory(category); }}
              >
                Delete
              </button>
            </div>

            {categoryOpen && (
              <div style={{ padding: '0 14px 14px', borderTop: '1px solid var(--border-soft)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, margin: '12px 0', flexWrap: 'wrap' }}>
                  <input
                    defaultValue={category.name}
                    onBlur={(e) => { const v = e.target.value.trim(); if (v && v !== category.name) renameCategory(category, v); }}
                    style={{ fontWeight: 700, fontSize: '1rem', width: 220 }}
                  />
                  <select value={category.placementType} onChange={(e) => updateCategoryType(category, e.target.value)}>
                    {PLACEMENT_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
                  </select>
                </div>

                {categoryItems.map((item) => {
                  const itemOpen = expandedItems.has(item.id);
                  const isBundle = item.lines.length > 1;
                  return (
                    <div key={item.id} style={{ border: '1px solid var(--border)', borderRadius: 'var(--radius-control)', marginBottom: 8, background: 'var(--background)' }}>
                      <div
                        onClick={() => toggleItem(item.id)}
                        style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px', cursor: 'pointer' }}
                      >
                        <span style={{ fontSize: '0.75rem', width: 12, display: 'inline-block' }}>{itemOpen ? '▾' : '▸'}</span>
                        <span style={{ fontWeight: 600 }}>{item.name}</span>
                        <span style={badgeStyle}>{isBundle ? `Bundle · ${item.lines.length} lines` : 'Single line'}</span>
                        <button
                          className="btn-link btn-link-danger"
                          style={{ marginLeft: 'auto' }}
                          onClick={(e) => { e.stopPropagation(); deleteItem(item); }}
                        >
                          Delete
                        </button>
                      </div>

                      {itemOpen && (
                        <div style={{ padding: '0 12px 12px', borderTop: '1px solid var(--border-soft)' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8, margin: '10px 0' }}>
                            <input
                              defaultValue={item.name}
                              onBlur={(e) => { const v = e.target.value.trim(); if (v && v !== item.name) renameItem(item, v); }}
                              style={{ fontWeight: 600, width: 260 }}
                            />
                          </div>

                          {isBundle && (
                            <div style={{ display: 'flex', gap: 16, alignItems: 'center', marginBottom: 8, flexWrap: 'wrap' }}>
                              {RATE_MODES.map((m) => (
                                <label key={m.value} style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontWeight: 400, fontSize: '0.85rem', marginBottom: 0 }}>
                                  <input
                                    type="radio"
                                    name={`rateMode-${item.id}`}
                                    checked={(item.rateMode || 'perLine') === m.value}
                                    onChange={() => updateItemRateMode(item, m.value)}
                                  />
                                  {m.label}
                                </label>
                              ))}
                              {item.rateMode === 'shared' && (
                                <>
                                  <select value={item.sharedCostMethod || 'CPM'} onChange={(e) => updateItemSharedCostMethod(item, e.target.value)}>
                                    <option value="CPM">CPM</option>
                                    <option value="Flat Fee">Flat Fee</option>
                                    <option value="AV">Added Value</option>
                                  </select>
                                  <input
                                    type="number"
                                    value={item.sharedRate || ''}
                                    onChange={(e) => updateItemSharedRate(item, e.target.value)}
                                    placeholder="Shared rate"
                                    style={{ width: 100 }}
                                  />
                                </>
                              )}
                            </div>
                          )}

                          <div className="table-scroll">
                            <table>
                              <thead>
                                <tr>
                                  <th>Platform</th><th>Description</th><th>Size</th>
                                  {item.rateMode !== 'shared' && <><th>Cost Method</th><th>Default Rate</th></>}
                                  <th></th>
                                </tr>
                              </thead>
                              <tbody>
                                {item.lines.map((line, idx) => (
                                  <tr key={idx}>
                                    <td><input value={line.platform} onChange={(e) => updateLine(item, idx, 'platform', e.target.value)} style={{ width: 110 }} /></td>
                                    <td><input value={line.description} onChange={(e) => updateLine(item, idx, 'description', e.target.value)} style={{ width: 200 }} /></td>
                                    <td><input value={line.size} onChange={(e) => updateLine(item, idx, 'size', e.target.value)} style={{ width: 80 }} /></td>
                                    {item.rateMode !== 'shared' && (
                                      <>
                                        <td>
                                          <select value={line.costMethod} onChange={(e) => updateLine(item, idx, 'costMethod', e.target.value)}>
                                            <option value="CPM">CPM</option>
                                            <option value="Flat Fee">Flat Fee</option>
                                            <option value="AV">Added Value</option>
                                            <option value="">— (bundled, no charge)</option>
                                          </select>
                                        </td>
                                        <td><input type="number" value={line.defaultRate} onChange={(e) => updateLine(item, idx, 'defaultRate', e.target.value)} style={{ width: 90 }} /></td>
                                      </>
                                    )}
                                    <td><button className="btn-link btn-link-danger" onClick={() => removeLine(item, idx)} disabled={item.lines.length <= 1}>✕</button></td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                          <button className="btn-link" onClick={() => addLine(item)} style={{ marginTop: 4 }}>+ Add line (make this a bundle)</button>
                        </div>
                      )}
                    </div>
                  );
                })}

                <button onClick={() => openAddPlacement(category.id)} style={{ marginTop: 4 }}>+ Add placement</button>
              </div>
            )}
          </div>
        );
      })}
      {categories.length === 0 && <p style={{ color: 'var(--text-muted)' }}>No categories yet.</p>}

      {addCategoryOpen && (
        <Modal title="Add Category" onCancel={() => setAddCategoryOpen(false)} onSubmit={createCategory} submitLabel="Create">
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <label>
              Name
              <input
                autoFocus
                value={addCategoryName}
                onChange={(e) => setAddCategoryName(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') createCategory(); }}
                style={{ width: '100%', marginTop: 4 }}
              />
            </label>
            <label>
              Revenue Type
              <select value={addCategoryType} onChange={(e) => setAddCategoryType(e.target.value)} style={{ width: '100%', marginTop: 4 }}>
                {PLACEMENT_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
              </select>
            </label>
          </div>
        </Modal>
      )}

      {addPlacementForCategoryId !== null && (
        <Modal title="Add Placement" onCancel={() => setAddPlacementForCategoryId(null)} onSubmit={createItem} submitLabel="Create">
          <label>
            Name
            <input
              autoFocus
              value={addPlacementName}
              onChange={(e) => setAddPlacementName(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') createItem(); }}
              style={{ width: '100%', marginTop: 4 }}
            />
          </label>
        </Modal>
      )}
    </div>
  );
}

export { PLACEMENT_TYPES, placementTypeLabel };
