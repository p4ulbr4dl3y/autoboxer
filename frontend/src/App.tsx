import { useState, useCallback } from 'react';
import './App.css';
import { useProjects, useProjectDetail } from './hooks/useProjects';
import { api } from './api/client';
import Header from './components/Header';
import Dashboard from './components/Dashboard';
import CreateProjectModal from './components/CreateProjectModal';
import ProjectGallery from './components/ProjectGallery';
import Editor from './components/Editor';

export default function App() {
  const [view, setView] = useState<'dashboard' | 'project' | 'editor'>('dashboard');
  const [selectedProjectId, setSelectedProjectId] = useState<number | null>(null);
  const [currentImageId, setCurrentImageId] = useState<number | null>(null);
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [isBatchLabeling, setIsBatchLabeling] = useState(false);

  const { projects, stats, fetchProjects, fetchStats, deleteProject } = useProjects();
  const {
    images, setImages, classes, setClasses,
    statusFilter, setStatusFilter, fetchProjectDetails, fetchProjectImages,
  } = useProjectDetail(selectedProjectId);

  const selectedProject = projects.find(p => p.id === selectedProjectId);

  const handleOpenProject = useCallback(async (id: number) => {
    setSelectedProjectId(id);
    await fetchProjectDetails(id);
    await fetchStats(id);
    setView('project');
  }, [fetchProjectDetails, fetchStats]);

  const handleHeaderNavigate = useCallback(async (target: 'dashboard' | 'project') => {
    if (target === 'dashboard') setSelectedProjectId(null);
    setView(target);
  }, []);

  const handleOpenEditor = useCallback((imageId: number) => {
    setCurrentImageId(imageId);
    setView('editor');
  }, []);

  const handleSaveAndExit = useCallback(() => {
    setView('project');
    if (selectedProjectId) {
      fetchProjectImages(selectedProjectId);
      fetchStats(selectedProjectId);
    }
  }, [selectedProjectId, fetchProjectImages, fetchStats]);

  const handleBatchLabel = useCallback(async (
    prompt: string, targetImages: 'unlabeled' | 'all', mode: 'overwrite' | 'merge',
    filterByClasses: boolean, targetClasses: string[],
  ) => {
    if (!selectedProjectId) return;
    setIsBatchLabeling(true);
    try {
      await api.projects.batchAutoLabel(selectedProjectId, {
        prompt, target_images: targetImages, mode, filter_by_classes: filterByClasses, target_classes: targetClasses,
      });
      await fetchStats(selectedProjectId);

      // Poll until batch is done
      const poll = async () => {
        const s = await api.projects.stats(selectedProjectId);
        stats[selectedProjectId] = s;
        if (s.batch_in_progress) {
          await fetchProjectImages(selectedProjectId);
          setTimeout(poll, 2000);
        } else {
          setIsBatchLabeling(false);
          await fetchProjectImages(selectedProjectId);
          await fetchStats(selectedProjectId);
        }
      };
      setTimeout(poll, 2000);
    } catch (e: any) {
      alert(`Error: ${e.message}`);
      setIsBatchLabeling(false);
    }
  }, [selectedProjectId, fetchStats, fetchProjectImages]);

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans">
      <Header view={view} selectedProjectId={selectedProjectId} onNavigate={handleHeaderNavigate} />

      <main className="flex-1 flex flex-col">
        {view === 'dashboard' && (
          <>
            <Dashboard
              projects={projects} stats={stats}
              onOpenProject={handleOpenProject} onDeleteProject={deleteProject}
              onCreateNew={() => setIsCreateModalOpen(true)}
            />
            <CreateProjectModal
              isOpen={isCreateModalOpen}
              onClose={() => setIsCreateModalOpen(false)}
              onCreated={fetchProjects}
            />
          </>
        )}

        {view === 'project' && selectedProjectId && selectedProject && (
          <ProjectGallery
            project={selectedProject} stats={stats[selectedProjectId]}
            images={images} classes={classes}
            statusFilter={statusFilter} isBatchLabeling={isBatchLabeling}
            setStatusFilter={setStatusFilter} setClasses={setClasses}
            onOpenEditor={handleOpenEditor} onBatchLabel={handleBatchLabel}
            onRefresh={() => { fetchProjectDetails(selectedProjectId); fetchStats(selectedProjectId); }}
          />
        )}

        {view === 'editor' && currentImageId && (
          <Editor
            currentImageId={currentImageId} images={images} classes={classes}
            project={selectedProject}
            onSaveAndExit={handleSaveAndExit}
            onImageChange={setCurrentImageId}
            setImages={setImages}
          />
        )}
      </main>
    </div>
  );
}
