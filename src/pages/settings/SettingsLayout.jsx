import { NavLink, Outlet } from 'react-router-dom';

// Same pattern as LogLayout — separate routes under a shared sub-nav, not
// tabs toggled by local state. Added (2026-09-11) once a second and third
// settings page (Agency/Hold Co, Pitch Lead/Pitch Team) joined Tags.
function subNavClass({ isActive }) {
  return isActive ? 'btn-link btn-link-primary' : 'btn-link';
}

export default function SettingsLayout() {
  return (
    <div>
      <nav style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
        <NavLink to="/settings/tags" className={subNavClass}>Tags</NavLink>
        <NavLink to="/settings/agencies" className={subNavClass}>Agency / Hold Co</NavLink>
        <NavLink to="/settings/pitch-team" className={subNavClass}>Pitch Lead / Pitch Team</NavLink>
      </nav>
      <Outlet />
    </div>
  );
}
