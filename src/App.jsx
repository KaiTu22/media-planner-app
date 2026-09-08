import { useEffect } from 'react';
import { Navigate, NavLink, Route, Routes, useNavigate } from 'react-router-dom';
import Assignment from './pages/Assignment';
import BackendCheck from './pages/BackendCheck';
import Browse from './pages/Browse';
import LogLayout from './pages/log/LogLayout';
import PlansLog from './pages/log/PlansLog';
import ProjectsLog from './pages/log/ProjectsLog';
import PlannerFrame from './pages/PlannerFrame';
import SandboxCheck from './pages/SandboxCheck';
import './App.css';

// Placeholder shell — Reporting becomes a real route once Deal Dashboard is
// ported in (§6.4).
function Placeholder({ title }) {
  return <p>{title} — not built yet.</p>;
}

function App() {
  const navigate = useNavigate();

  // The embedded Planner tool posts this when its own "Back to Projects"
  // is clicked (confirmed 2026-09-08) — it can't navigate the parent shell
  // directly since it's a same-window <iframe>, not a same-origin child.
  useEffect(() => {
    function onMessage(event) {
      if (event.data && event.data.type === 'planner:back-to-browse') {
        navigate('/browse');
      }
    }
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, [navigate]);

  return (
    <div className="shell">
      <header className="shell-header">
        <div className="wordmark">MEDIA PLANNER</div>
        <div className="wordmark-sub">Paramount Skydance · Media Planning Tool</div>
        <nav className="shell-nav">
          <NavLink to="/" end>Assignment</NavLink>
          <NavLink to="/browse">Browse</NavLink>
          <NavLink to="/log">Log</NavLink>
          <NavLink to="/reporting">Reporting</NavLink>
          <NavLink to="/backend-check">Backend check</NavLink>
          <NavLink to="/sandbox-check">Sandbox check</NavLink>
        </nav>
      </header>
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
          <Route path="/planner" element={<PlannerFrame />} />
          <Route path="/planner/:projectId" element={<PlannerFrame />} />
          <Route path="/backend-check" element={<BackendCheck />} />
          <Route path="/sandbox-check" element={<SandboxCheck />} />
        </Routes>
      </main>
    </div>
  );
}

export default App;
