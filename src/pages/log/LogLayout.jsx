import { useState } from 'react';
import { NavLink, Outlet } from 'react-router-dom';
import NewAssignmentModal from '../../components/NewAssignmentModal';

// §6.3 confirmed: Assignment Log and Plans Log are two separate routes, not
// tabs on one page — this just gives them a shared sub-nav, not a merged view.
function subNavClass({ isActive }) {
  return isActive ? 'btn-link btn-link-primary' : 'btn-link';
}

// "+ New Assignment" lives here (confirmed 2026-09-14), not on ProjectsLog
// itself, so it's visible next to the tabs regardless of which Log tab is
// open. The just-created project is handed down via Outlet context rather
// than lifting all of ProjectsLog's state up here — whichever tab is
// currently mounted (Assignment Log or My Assignments; Plans Log has
// nothing to do with it) picks it up and appends it locally.
export default function LogLayout() {
  const [showNewAssignment, setShowNewAssignment] = useState(false);
  const [lastCreatedProject, setLastCreatedProject] = useState(null);

  return (
    <div>
      <nav style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 16 }}>
        <NavLink to="/log/projects" className={subNavClass}>Assignment Log</NavLink>
        <NavLink to="/log/mine" className={subNavClass}>My Assignments</NavLink>
        <NavLink to="/log/plans" className={subNavClass}>Plans Log</NavLink>
        <button
          onClick={() => setShowNewAssignment(true)}
          style={{ marginLeft: 'auto', background: '#00C853', borderColor: '#00C853', color: '#fff', fontWeight: 700 }}
        >
          + New Assignment
        </button>
      </nav>
      <Outlet context={{ lastCreatedProject }} />
      {showNewAssignment && (
        <NewAssignmentModal
          onClose={() => setShowNewAssignment(false)}
          onCreated={(project) => setLastCreatedProject(project)}
        />
      )}
    </div>
  );
}
