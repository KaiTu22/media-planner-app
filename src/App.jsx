import { Navigate, NavLink, Route, Routes } from 'react-router-dom';
import Assignment from './pages/Assignment';
import BackendCheck from './pages/BackendCheck';
import Browse from './pages/Browse';
import { PLANNER_TOOL_URL } from './api/config';
import LogLayout from './pages/log/LogLayout';
import PlansLog from './pages/log/PlansLog';
import ProjectsLog from './pages/log/ProjectsLog';
import SandboxCheck from './pages/SandboxCheck';
import './App.css';

// Placeholder shell — Reporting becomes a real route once Deal Dashboard is
// ported in (§6.4). Planner stays a link out to the separate vanilla-JS
// tool until Phase E folds it into this app's routing (§7, §8).
function Placeholder({ title }) {
  return <p>{title} — not built yet.</p>;
}

function PlannerLink() {
  return (
    <div>
      <h2>Planner</h2>
      <p>
        The Planner tool is still a separate page (folding it into this app's routing is Phase E,
        scheduled Q1/Q2 2027). It's connected to this same backend — work done there shows up in
        the Log automatically.
      </p>
      <a href={PLANNER_TOOL_URL} target="_blank" rel="noreferrer">Open Planner Tool →</a>
    </div>
  );
}

function App() {
  return (
    <div className="shell">
      <nav className="shell-nav">
        <NavLink to="/" end>Assignment</NavLink>
        <NavLink to="/browse">Browse</NavLink>
        <NavLink to="/log">Log</NavLink>
        <NavLink to="/reporting">Reporting</NavLink>
        <NavLink to="/planner">Planner</NavLink>
        <NavLink to="/backend-check">Backend check</NavLink>
        <NavLink to="/sandbox-check">Sandbox check</NavLink>
      </nav>
      <main className="shell-main">
        <Routes>
          <Route path="/" element={<Assignment />} />
          <Route path="/browse" element={<Browse />} />
          <Route path="/log" element={<LogLayout />}>
            <Route index element={<Navigate to="projects" replace />} />
            <Route path="projects" element={<ProjectsLog />} />
            <Route path="plans" element={<PlansLog />} />
          </Route>
          <Route path="/reporting" element={<Placeholder title="Reporting" />} />
          <Route path="/planner" element={<PlannerLink />} />
          <Route path="/backend-check" element={<BackendCheck />} />
          <Route path="/sandbox-check" element={<SandboxCheck />} />
        </Routes>
      </main>
    </div>
  );
}

export default App;
