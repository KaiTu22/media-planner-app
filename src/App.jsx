import { NavLink, Route, Routes } from 'react-router-dom';
import Assignment from './pages/Assignment';
import BackendCheck from './pages/BackendCheck';
import SandboxCheck from './pages/SandboxCheck';
import './App.css';

// Placeholder shell — Assignment/Log/Reporting/Planner become real routes as
// each phase in End-to-End-System-Plan.md lands (§7: one integrated app, one
// login session, one URL).
function Placeholder({ title }) {
  return <p>{title} — not built yet.</p>;
}

function App() {
  return (
    <div className="shell">
      <nav className="shell-nav">
        <NavLink to="/" end>Assignment</NavLink>
        <NavLink to="/log">Log</NavLink>
        <NavLink to="/reporting">Reporting</NavLink>
        <NavLink to="/planner">Planner</NavLink>
        <NavLink to="/backend-check">Backend check</NavLink>
        <NavLink to="/sandbox-check">Sandbox check</NavLink>
      </nav>
      <main className="shell-main">
        <Routes>
          <Route path="/" element={<Assignment />} />
          <Route path="/log" element={<Placeholder title="Log" />} />
          <Route path="/reporting" element={<Placeholder title="Reporting" />} />
          <Route path="/planner" element={<Placeholder title="Planner" />} />
          <Route path="/backend-check" element={<BackendCheck />} />
          <Route path="/sandbox-check" element={<SandboxCheck />} />
        </Routes>
      </main>
    </div>
  );
}

export default App;
