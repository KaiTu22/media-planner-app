import { NavLink, Outlet } from 'react-router-dom';

// §6.3 confirmed: Assignment Log and Plans Log are two separate routes, not
// tabs on one page — this just gives them a shared sub-nav, not a merged view.
function subNavClass({ isActive }) {
  return isActive ? 'btn-link btn-link-primary' : 'btn-link';
}

export default function LogLayout() {
  return (
    <div>
      <nav style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
        <NavLink to="/log/projects" className={subNavClass}>Assignment Log</NavLink>
        <NavLink to="/log/mine" className={subNavClass}>My Assignments</NavLink>
        <NavLink to="/log/plans" className={subNavClass}>Plans Log</NavLink>
      </nav>
      <Outlet />
    </div>
  );
}
