import { Link, useParams } from 'react-router-dom';
import { PLANNER_TOOL_URL } from '../api/config';

// Embeds the still-vanilla-JS Planner tool via <iframe> rather than
// rewriting its 16,700-line calculation engine — §7 already commits to
// that engine staying as-is until a real, deliberate Phase E rewrite.
// This is what makes "one app, one URL" true today: the tool itself
// hides its own header/project-list chrome and reads ?projectId= to open
// directly into the right project (see index.html's embedded-mode
// handling, confirmed 2026-09-08).
export default function PlannerFrame() {
  const { projectId } = useParams();

  if (!projectId) {
    return (
      <div>
        <h2>Planner</h2>
        <p>Pick a project from <Link to="/browse">Browse</Link> to open it here.</p>
      </div>
    );
  }

  const src = `${PLANNER_TOOL_URL}?embedded=1&projectId=${encodeURIComponent(projectId)}`;
  return (
    <iframe
      src={src}
      title="Planner"
      style={{ width: '100%', height: 'calc(100vh - 120px)', border: 'none' }}
    />
  );
}
