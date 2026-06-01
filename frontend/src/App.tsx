import { useState, useCallback, useRef } from 'react';
import { Routes, Route } from 'react-router-dom';
import './App.css';
import { useProjects, useProjectDetail } from './hooks/useProjects';
import { api } from './api/client';
import AppContext from './context/AppContext';
import AppLayout from './layouts/AppLayout';
import DashboardPage from './pages/DashboardPage';
import ProjectGalleryPage from './pages/ProjectGalleryPage';
import EditorPage from './pages/EditorPage';
import ConfirmModal from './components/ConfirmModal';

export default function App() {
  // Confirmation / info modals
  const [deleteProjectId, setDeleteProjectId] = useState<number | null>(null);
  const [errorModal, setErrorModal] = useState<{ title: string; message: string } | null>(null);
  const [deleteClassInfo, setDeleteClassInfo] = useState<{ id: number; name: string } | null>(null);

  const [isBatchLabeling, setIsBatchLabeling] = useState(false);

  const { projects, stats, fetchProjects, fetchStats, deleteProject } = useProjects();
  const {
    images, setImages, classes, setClasses,
    statusFilter, setStatusFilter, fetchProjectDetails, fetchProjectImages,
  } = useProjectDetail(null);

  // Tracks the currently-open project so async pollers can detect navigation
  // away and stop touching another project's state.
  const currentProjectIdRef = useRef<number | null>(null);

  const handleDeleteClass = useCallback(async (classId: number) => {
    try {
      await api.classes.delete(classId);
      setClasses(prev => prev.filter(c => c.id !== classId));
      // We need to find the current project ID from the URL, but since we're
      // in a callback, we'll just refresh projects list
      await fetchProjects();
    } catch (e: any) {
      setErrorModal({ title: 'Delete Class Failed', message: e.message });
    }
  }, [setClasses, fetchProjects]);

  const handleBatchLabel = useCallback(async () => {
    // Get current project ID from the first image or classes
    const projectId = images.length > 0 ? images[0].project_id : classes.length > 0 ? classes[0].project_id : null;
    if (!projectId) return;

    const s = stats[projectId];
    const totalImages = s ? s.total_images : images.length;
    if (totalImages === 0) {
      setErrorModal({ title: 'No Images', message: 'Upload some images before running auto-labeling.' });
      return;
    }
    if (classes.length === 0) {
      setErrorModal({ title: 'No Classes Defined', message: 'Add at least one label class before running auto-labeling. The model needs classes to locate.' });
      return;
    }
    if (s && s.unlabeled_images === 0) {
      setErrorModal({ title: 'Nothing to Label', message: 'All images in this project are already labeled. Auto-labeling only runs on unlabeled images.' });
      return;
    }
    setIsBatchLabeling(true);
    currentProjectIdRef.current = projectId;
    try {
      await api.projects.batchAutoLabel(projectId, {
        prompt: '', target_images: 'unlabeled', mode: 'merge', filter_by_classes: true, target_classes: [],
      });
      await fetchStats(projectId);

      const pid = projectId;
      const poll = async () => {
        // Stop polling if the user navigated to another project / the dashboard.
        if (currentProjectIdRef.current !== pid) {
          setIsBatchLabeling(false);
          return;
        }
        try {
          const s = await api.projects.stats(pid);
          if (s.batch_in_progress) {
            await fetchProjectImages(pid);
            await fetchStats(pid);
            setTimeout(poll, 2000);
          } else {
            setIsBatchLabeling(false);
            await fetchProjectImages(pid);
            await fetchStats(pid);
          }
        } catch {
          setIsBatchLabeling(false);
        }
      };
      setTimeout(poll, 2000);
    } catch (e: any) {
      setErrorModal({ title: 'Batch Labeling Failed', message: e.message });
      setIsBatchLabeling(false);
    }
  }, [images, classes, stats, fetchStats, fetchProjectImages]);

  const handleConfirmDeleteProject = useCallback(async () => {
    if (deleteProjectId === null) return;
    try {
      await deleteProject(deleteProjectId);
      setDeleteProjectId(null);
    } catch (e: any) {
      setErrorModal({ title: 'Delete Failed', message: e.message });
    }
  }, [deleteProjectId, deleteProject]);

  const contextValue = {
    projects, stats, fetchProjects, fetchStats, deleteProject,
    images, setImages, classes, setClasses,
    statusFilter, setStatusFilter, fetchProjectDetails, fetchProjectImages,
    deleteProjectId, setDeleteProjectId,
    deleteClassInfo, setDeleteClassInfo,
    errorModal, setErrorModal,
    isBatchLabeling, handleBatchLabel,
  };

  return (
    <AppContext.Provider value={contextValue}>
      <Routes>
        <Route element={<AppLayout />}>
          <Route index element={<DashboardPage />} />
          <Route path="projects/:projectId" element={<ProjectGalleryPage />} />
          <Route path="projects/:projectId/images/:imageId" element={<EditorPage />} />
        </Route>
      </Routes>

      {/* Global modals */}
      <ConfirmModal
        isOpen={deleteProjectId !== null}
        title="Delete Project"
        message="Are you sure you want to delete this project? All images and annotations will be permanently removed."
        confirmLabel="Delete"
        variant="danger"
        onConfirm={handleConfirmDeleteProject}
        onClose={() => setDeleteProjectId(null)}
      />

      <ConfirmModal
        isOpen={deleteClassInfo !== null}
        title="Delete Class"
        message={`Delete "${deleteClassInfo?.name}"? All annotations of this class will be removed and affected images will be marked as unlabeled.`}
        confirmLabel="Delete"
        variant="danger"
        onConfirm={() => { if (deleteClassInfo) handleDeleteClass(deleteClassInfo.id); }}
        onClose={() => setDeleteClassInfo(null)}
      />

      <ConfirmModal
        isOpen={errorModal !== null}
        title={errorModal?.title || 'Error'}
        message={errorModal?.message || ''}
        confirmLabel="OK"
        variant="info"
        onConfirm={() => {}}
        onClose={() => setErrorModal(null)}
      />
    </AppContext.Provider>
  );
}
