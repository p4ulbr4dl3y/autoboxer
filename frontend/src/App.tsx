import { useState, useCallback, useRef } from 'react';
import { Outlet, useNavigate } from 'react-router-dom';
import './App.css';
import { useProjects, useProjectDetail } from './hooks/useProjects';
import { api } from './api/client';
import AppContext from './context/AppContext';
import ConfirmModal from './components/ConfirmModal';

export default function App() {
  const navigate = useNavigate();

  // Confirmation / info modals
  const [deleteProjectId, setDeleteProjectId] = useState<number | null>(null);
  const [errorModal, setErrorModal] = useState<{ title: string; message: string } | null>(null);
  const [deleteClassInfo, setDeleteClassInfo] = useState<{ id: number; name: string } | null>(null);
  const [deleteImageInfo, setDeleteImageInfo] = useState<{ id: number; filename: string; fromEditor?: boolean } | null>(null);

  const [isBatchLabeling, setIsBatchLabeling] = useState(false);

  const { projects, stats, fetchProjects, fetchStats, deleteProject } = useProjects();
  const {
    images, setImages, classes, setClasses,
    statusFilter, setStatusFilter, fetchProjectDetails, fetchProjectImages,
  } = useProjectDetail(null);

  // Tracks the currently-open project so async pollers can detect navigation
  // away and stop touching another project's state.
  const currentProjectIdRef = useRef<number | null>(null);
  const navigatingWithinEditorRef = useRef(false);

  const handleDeleteClass = useCallback(async (classId: number) => {
    try {
      await api.classes.delete(classId);
      setClasses(prev => prev.filter(c => c.id !== classId));
      await fetchProjects();
    } catch (e) {
      setErrorModal({ title: 'Delete Class Failed', message: (e as Error).message });
    }
  }, [setClasses, fetchProjects]);

  const handleBatchLabel = useCallback(async (config: {
    target_images: 'all' | 'unlabeled';
    mode: 'merge' | 'overwrite';
    target_classes: string[];
  }) => {
    const projectId = images.length > 0 ? images[0].project_id : classes.length > 0 ? classes[0].project_id : null;
    if (!projectId) return;

    setIsBatchLabeling(true);
    currentProjectIdRef.current = projectId;
    try {
      await api.projects.batchAutoLabel(projectId, {
        prompt: '',
        target_images: config.target_images,
        mode: config.mode,
        filter_by_classes: true,
        target_classes: config.target_classes,
      });
      await fetchStats(projectId);

      const pid = projectId;
      const poll = async () => {
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
    } catch (e) {
      setErrorModal({ title: 'Batch Labeling Failed', message: (e as Error).message });
      setIsBatchLabeling(false);
    }
  }, [images, classes, fetchStats, fetchProjectImages]);

  const handleConfirmDeleteProject = useCallback(async () => {
    if (deleteProjectId === null) return;
    try {
      await deleteProject(deleteProjectId);
      setDeleteProjectId(null);
    } catch (e) {
      setErrorModal({ title: 'Delete Failed', message: (e as Error).message });
    }
  }, [deleteProjectId, deleteProject]);

  const handleConfirmDeleteImage = useCallback(async () => {
    if (deleteImageInfo === null) return;
    const { id: imageId, fromEditor } = deleteImageInfo;
    const targetImage = images.find(img => img.id === imageId);
    const projectId = targetImage?.project_id || (images.length > 0 ? images[0].project_id : null);

    try {
      await api.images.delete(imageId);
      
      setImages(prev => prev.filter(img => img.id !== imageId));

      if (projectId) {
        await fetchStats(projectId);
        await fetchProjects();
      }

      if (fromEditor && projectId) {
        const currentIndex = images.findIndex(img => img.id === imageId);
        let targetNextImageId: number | null = null;

        if (images.length > 1) {
          if (currentIndex < images.length - 1) {
            targetNextImageId = images[currentIndex + 1].id;
          } else {
            targetNextImageId = images[currentIndex - 1].id;
          }
        }

        navigatingWithinEditorRef.current = true;

        if (targetNextImageId !== null) {
          navigate(`/projects/${projectId}/images/${targetNextImageId}`, { replace: true });
          setTimeout(() => { navigatingWithinEditorRef.current = false; }, 0);
        } else {
          navigate(`/projects/${projectId}`);
          setTimeout(() => { navigatingWithinEditorRef.current = false; }, 0);
        }
      }
    } catch (e) {
      setErrorModal({ title: 'Delete Image Failed', message: (e as Error).message });
    } finally {
      setDeleteImageInfo(null);
    }
  }, [deleteImageInfo, images, setImages, fetchStats, fetchProjects, navigate]);

  const contextValue = {
    projects, stats, fetchProjects, fetchStats, deleteProject,
    images, setImages, classes, setClasses,
    statusFilter, setStatusFilter, fetchProjectDetails, fetchProjectImages,
    deleteProjectId, setDeleteProjectId,
    deleteClassInfo, setDeleteClassInfo,
    deleteImageInfo, setDeleteImageInfo,
    navigatingWithinEditorRef,
    errorModal, setErrorModal,
    isBatchLabeling, handleBatchLabel,
  };

  return (
    <AppContext.Provider value={contextValue}>
      <Outlet />

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
        isOpen={deleteImageInfo !== null}
        title="Delete Image"
        message={`Are you sure you want to permanently delete "${deleteImageInfo?.filename}"? This will delete the image file from disk and all its annotations.`}
        confirmLabel="Delete"
        variant="danger"
        onConfirm={handleConfirmDeleteImage}
        onClose={() => setDeleteImageInfo(null)}
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
