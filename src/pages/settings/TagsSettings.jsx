import { useEffect, useState } from 'react';
import { appsScriptPost, jsonpRequest, verifyByPolling } from '../../api/appsScript';
import { SANDBOX_API_URL } from '../../api/config';

// Preset swatches only, matching the backend's TAG_COLORS (Code.gs) —
// tags are a managed vocabulary (§6.3), not free-form, so color assignment
// stays a picked choice too rather than an arbitrary hex value.
export const TAG_COLORS = ['#0064FF', '#0E9F8E', '#C98A2C', '#C24463', '#7C5CBF', '#2B8A9E', '#8A8271', '#000A3C'];

// Moved out of the Log (confirmed 2026-09-10) — tag *management* (creating,
// coloring, deleting the vocabulary) is a settings-style action taken
// rarely, distinct from *applying* tags to a project which stays on the Log
// table itself. Keeping both on the Log page was crowding its header.
export default function TagsSettings() {
  const [tags, setTags] = useState([]);
  const [status, setStatus] = useState('loading');
  const [error, setError] = useState(null);
  const [newTagName, setNewTagName] = useState('');
  const [newTagColor, setNewTagColor] = useState(TAG_COLORS[0]);

  const refresh = () => {
    setStatus('loading');
    jsonpRequest(SANDBOX_API_URL, { action: 'listTags' })
      .then((rows) => { setTags(rows); setStatus('done'); })
      .catch((err) => { setError(err.message); setStatus('error'); });
  };

  useEffect(refresh, []);

  const createTag = async () => {
    const name = newTagName.trim();
    if (!name) return;
    const id = `tag-${Date.now()}`;
    const color = newTagColor;
    setTags((prev) => [...prev, { id, name, color }]);
    try {
      await appsScriptPost(SANDBOX_API_URL, { action: 'createTag', payload: JSON.stringify({ id, name, color }) });
      await verifyByPolling(async () => {
        const rows = await jsonpRequest(SANDBOX_API_URL, { action: 'listTags' });
        return rows.some((t) => t.id === id);
      });
      setNewTagName('');
    } catch (err) {
      setTags((prev) => prev.filter((t) => t.id !== id));
      window.alert(`Could not create tag: ${err.message}`);
    }
  };

  const recolorTag = async (tag, color) => {
    const previous = tags;
    setTags((prev) => prev.map((t) => (t.id === tag.id ? { ...t, color } : t)));
    try {
      await appsScriptPost(SANDBOX_API_URL, { action: 'updateTag', payload: JSON.stringify({ id: tag.id, color }) });
      await verifyByPolling(async () => {
        const rows = await jsonpRequest(SANDBOX_API_URL, { action: 'listTags' });
        return rows.find((t) => t.id === tag.id)?.color === color;
      });
    } catch (err) {
      setTags(previous);
      window.alert(`Could not update tag color: ${err.message}`);
    }
  };

  const deleteTag = async (tag) => {
    if (!window.confirm(`Delete tag "${tag.name}"? It will be removed from every project that has it.`)) return;
    const previous = tags;
    setTags((prev) => prev.filter((t) => t.id !== tag.id));
    try {
      await appsScriptPost(SANDBOX_API_URL, { action: 'deleteTag', payload: JSON.stringify({ id: tag.id }) });
      await verifyByPolling(async () => {
        const rows = await jsonpRequest(SANDBOX_API_URL, { action: 'listTags' });
        return !rows.some((t) => t.id === tag.id);
      });
    } catch (err) {
      setTags(previous);
      window.alert(`Could not delete tag: ${err.message}`);
    }
  };

  if (status === 'loading') return <p>Loading tags…</p>;
  if (status === 'error') return <p style={{ color: 'crimson' }}>Failed: {error}</p>;

  return (
    <div>
      <h2>Manage tags</h2>
      <p style={{ color: 'var(--text-muted)', maxWidth: 560 }}>
        Tags are a managed list shared by everyone in the Assignment Log — add one here before it can be applied to a project.
      </p>

      <div className="table-scroll" style={{ maxWidth: 560, marginTop: 16 }}>
        <table>
          <thead>
            <tr><th>Tag</th><th>Color</th><th></th></tr>
          </thead>
          <tbody>
            {tags.map((t) => (
              <tr key={t.id}>
                <td>
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: `${t.color}1a`, color: t.color, borderRadius: 100, padding: '2px 10px', fontSize: '0.8rem', fontWeight: 600 }}>
                    {t.name}
                  </span>
                </td>
                <td>
                  <div style={{ display: 'flex', gap: 4 }}>
                    {TAG_COLORS.map((c) => (
                      <button
                        key={c}
                        onClick={() => recolorTag(t, c)}
                        title={c}
                        style={{
                          width: 18, height: 18, borderRadius: '50%', padding: 0,
                          background: c, border: c === t.color ? '2px solid var(--text-primary)' : '1px solid var(--border)',
                        }}
                      />
                    ))}
                  </div>
                </td>
                <td><button className="btn-link" onClick={() => deleteTag(t)}>Delete</button></td>
              </tr>
            ))}
            {tags.length === 0 && (
              <tr><td colSpan={3} style={{ color: 'var(--text-muted)' }}>No tags yet.</td></tr>
            )}
          </tbody>
        </table>
      </div>

      <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 16 }}>
        <input value={newTagName} onChange={(e) => setNewTagName(e.target.value)} placeholder="New tag name" style={{ width: 180 }} />
        <div style={{ display: 'flex', gap: 4 }}>
          {TAG_COLORS.map((c) => (
            <button
              key={c}
              onClick={() => setNewTagColor(c)}
              title={c}
              style={{
                width: 18, height: 18, borderRadius: '50%', padding: 0,
                background: c, border: c === newTagColor ? '2px solid var(--text-primary)' : '1px solid var(--border)',
              }}
            />
          ))}
        </div>
        <button onClick={createTag}>Add tag</button>
      </div>
    </div>
  );
}
