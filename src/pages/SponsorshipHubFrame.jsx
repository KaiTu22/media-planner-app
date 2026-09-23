import { PLANNER_TOOL_URL } from '../api/config';

// Same embedding approach as PlannerFrame (confirmed 2026-09-23) — the Hub
// lives inside the still-vanilla-JS Planner tool, but unlike PlannerFrame
// it's project-independent (the catalog is built/browsed with no specific
// project in context), so it's reachable straight from the app shell's own
// top-level nav rather than requiring a project to be opened first. `view=
// sponsorshiphub` (no projectId) tells index.html to skip its project list
// and land directly on the Hub's own tab.
export default function SponsorshipHubFrame() {
  const src = `${PLANNER_TOOL_URL}?embedded=1&view=sponsorshiphub`;
  return (
    <iframe
      src={src}
      title="Sponsorship Hub"
      style={{ width: '100%', height: 'calc(100vh - 120px)', border: 'none' }}
    />
  );
}
