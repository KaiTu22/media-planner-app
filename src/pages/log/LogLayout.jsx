import { NavLink, Outlet } from 'react-router-dom';

// §6.3 confirmed: Assignment Log and Plans Log are two separate routes, not
// tabs on one page — this just gives them a shared sub-nav, not a merged view.
export default function LogLayout() {
  return (
    <div>
      <nav style={{ display: 'flex', gap: 12, marginBottom: 16 }}>
        <NavLink to="/log/projects">Assignment Log</NavLink>
        <NavLink to="/log/plans">Plans Log</NavLink>
      </nav>
      <Outlet />
    </div>
  );
}
