import { useState, useCallback, useRef, useEffect } from 'react';
import './App.css';
import { useProjects, useProjectDetail } from './hooks/useProjects';
import { api } from './api/client';
import Header from './components/Header';
import Dashboard from './components/Dashboard';
import CreateProjectModal from './components/CreateProjectModal';
import ProjectGallery from './components/ProjectGallery';
import Editor from './components/Editor';
import ConfirmModal from './components/ConfirmModal';

export default function App() {
  const [view, setView] = useState<'dashboard' | 'project' | 'editor'>('dashboard');
  const [selectedProjectId, setSelectedProjectId] = useState<number | null>(null);
  const [currentImageId, setCurrentImageId] = useState<number | null>(null);
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [isBatchLabeling, setIsBatchLabeling] = useState(false);

  // Confirmation / info modals
  const [deleteProjectId, setDeleteProjectId] = useState<number | null>(null);
  const [errorModal, setErrorModal] = useState<{ title: string; message: string } | null>(null);
  const [deleteClassInfo, setDeleteClassInfo] = useState<{ id: number; name: string } | null>(null);

  // Editor unsaved-changes guard
  const [editorDirty, setEditorDirty] = useState(false);
  const [pendingNav, setPendingNav] = useState<'dashboard' | 'project' | null>(null);

  const { projects, stats, fetchProjects, fetchStats, deleteProject } = useProjects();
  const {
    images, setImages, classes, setClasses,
    statusFilter, setStatusFilter, fetchProjectDetails, fetchProjectImages,
  } = useProjectDetail(selectedProjectId);

  const selectedProject = projects.find(p => p.id === selectedProjectId);

  // Tracks the currently-open project so async pollers can detect navigation
  // away and stop touching another project's state.
  const selectedProjectIdRef = useRef(selectedProjectId);
  useEffect(() => { selectedProjectIdRef.current = selectedProjectId; }, [selectedProjectId]);

  const handleOpenProject = useCallback(async (id: number) => {
    setSelectedProjectId(id);
    await fetchProjectDetails(id);
    await fetchStats(id);
    setView('project');
  }, [fetchProjectDetails, fetchStats]);

  const doNavigate = useCallback((target: 'dashboard' | 'project') => {
    if (target === 'dashboard') setSelectedProjectId(null);
    setView(target);
    setEditorDirty(false);
  }, []);

  const handleHeaderNavigate = useCallback((target: 'dashboard' | 'project') => {
    // Guard against silently dropping unsaved annotations when leaving the editor.
    if (view === 'editor' && editorDirty) { setPendingNav(target); return; }
    doNavigate(target);
  }, [view, editorDirty, doNavigate]);

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

  const handleBatchLabel = useCallback(async () => {
    if (!selectedProjectId) return;
    const s = stats[selectedProjectId];
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
    try {
      await api.projects.batchAutoLabel(selectedProjectId, {
        prompt: '', target_images: 'unlabeled', mode: 'merge', filter_by_classes: true, target_classes: [],
      });
      await fetchStats(selectedProjectId);

      const pid = selectedProjectId;
      const poll = async () => {
        // Stop polling if the user navigated to another project / the dashboard.
        if (selectedProjectIdRef.current !== pid) {
          setIsBatchLabeling(false);
          return;
        }
        try {
          const s = await api.projects.stats(pid);
          if (s.batch_in_progress) {
            await fetchProjectImages(pid);
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
  }, [selectedProjectId, images.length, classes.length, stats, fetchStats, fetchProjectImages]);

  const handleConfirmDeleteProject = useCallback(async () => {
    if (deleteProjectId === null) return;
    try {
      await deleteProject(deleteProjectId);
      if (selectedProjectId === deleteProjectId) {
        setSelectedProjectId(null);
        setView('dashboard');
      }
    } catch (e: any) {
      setErrorModal({ title: 'Delete Failed', message: e.message });
    }
  }, [deleteProjectId, selectedProjectId, deleteProject]);

  const handleDeleteClass = useCallback(async (classId: number) => {
    try {
      await api.classes.delete(classId);
      setClasses(prev => prev.filter(c => c.id !== classId));
      if (selectedProjectId) {
        await fetchProjectImages(selectedProjectId);
        await fetchStats(selectedProjectId);
      }
    } catch (e: any) {
      setErrorModal({ title: 'Delete Class Failed', message: e.message });
    }
  }, [selectedProjectId, setClasses, fetchProjectImages, fetchStats]);

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans">
      <Header view={view} selectedProjectId={selectedProjectId} onNavigate={handleHeaderNavigate} />

      <main className="flex-1 flex flex-col">
        {view === 'dashboard' && (
          <>
            <Dashboard
              projects={projects} stats={stats}
              onOpenProject={handleOpenProject} onDeleteProject={id => setDeleteProjectId(id)}
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
            onDeleteClass={classId => {
              const cls = classes.find(c => c.id === classId);
              if (cls) setDeleteClassInfo({ id: classId, name: cls.name });
            }}
            onRefresh={() => { fetchProjectDetails(selectedProjectId); fetchStats(selectedProjectId); }}
            onError={(title, message) => setErrorModal({ title, message })}
          />
        )}

        {view === 'editor' && currentImageId && (
          <Editor
            currentImageId={currentImageId} images={images} classes={classes}
            onSaveAndExit={handleSaveAndExit}
            onImageChange={setCurrentImageId}
            setImages={setImages}
            onError={(title, message) => setErrorModal({ title, message })}
            onDirtyChange={setEditorDirty}
          />
        )}
      </main>

      {/* Delete project confirmation */}
      <ConfirmModal
        isOpen={deleteProjectId !== null}
        title="Delete Project"
        message="Are you sure you want to delete this project? All images and annotations will be permanently removed."
        confirmLabel="Delete"
        variant="danger"
        onConfirm={handleConfirmDeleteProject}
        onClose={() => setDeleteProjectId(null)}
      />

      {/* Delete class confirmation */}
      <ConfirmModal
        isOpen={deleteClassInfo !== null}
        title="Delete Class"
        message={`Delete "${deleteClassInfo?.name}"? All annotations of this class will be removed and affected images will be marked as unlabeled.`}
        confirmLabel="Delete"
        variant="danger"
        onConfirm={() => { if (deleteClassInfo) handleDeleteClass(deleteClassInfo.id); }}
        onClose={() => setDeleteClassInfo(null)}
      />

      {/* Unsaved-changes guard when leaving the editor */}
      <ConfirmModal
        isOpen={pendingNav !== null}
        title="Unsaved Changes"
        message="You have unsaved annotation changes. Leave the editor without saving? Your changes will be lost."
        confirmLabel="Discard & Leave"
        cancelLabel="Keep Editing"
        variant="danger"
        onConfirm={() => { if (pendingNav) doNavigate(pendingNav); }}
        onClose={() => setPendingNav(null)}
      />

      {/* Error / info modal */}
      <ConfirmModal
        isOpen={errorModal !== null}
        title={errorModal?.title || 'Error'}
        message={errorModal?.message || ''}
        confirmLabel="OK"
        variant="info"
        onConfirm={() => {}}
        onClose={() => setErrorModal(null)}
      />
    </div>
  );
}
