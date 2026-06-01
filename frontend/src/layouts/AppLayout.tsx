import { Outlet, useLocation, useParams } from 'react-router-dom';
import Header from '../components/Header';

export default function AppLayout() {
  const location = useLocation();
  const { projectId } = useParams<{ projectId: string }>();

  // Determine current view from route
  const isEditor = location.pathname.includes('/images/');
  const isProject = !isEditor && location.pathname.startsWith('/projects/');
  const view = isEditor ? 'editor' : isProject ? 'project' : 'dashboard';

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans">
      <Header
        view={view}
        selectedProjectId={projectId ? Number(projectId) : null}
      />

      <main className="flex-1 flex flex-col">
        <Outlet />
      </main>
    </div>
  );
}
