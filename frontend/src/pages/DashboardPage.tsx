import { useNavigate } from 'react-router-dom';
import { useAppContext } from '../context/AppContext';
import Dashboard from '../components/Dashboard';
import CreateProjectModal from '../components/CreateProjectModal';
import { useState } from 'react';

export default function DashboardPage() {
  const { projects, stats, fetchProjects, setDeleteProjectId } = useAppContext();
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const navigate = useNavigate();

  return (
    <>
      <Dashboard
        projects={projects}
        stats={stats}
        onOpenProject={id => navigate(`/projects/${id}`)}
        onDeleteProject={id => setDeleteProjectId(id)}
        onCreateNew={() => setIsCreateModalOpen(true)}
      />
      <CreateProjectModal
        isOpen={isCreateModalOpen}
        onClose={() => setIsCreateModalOpen(false)}
        onCreated={fetchProjects}
      />
    </>
  );
}
