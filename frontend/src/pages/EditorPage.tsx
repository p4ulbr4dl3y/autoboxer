import { useState, useCallback, useEffect, useRef } from 'react';
import { useParams, useNavigate, useBlocker } from 'react-router-dom';
import { useAppContext } from '../context/AppContext';
import Editor from '../components/Editor';
import ConfirmModal from '../components/ConfirmModal';

export default function EditorPage() {
  const { projectId, imageId } = useParams<{ projectId: string; imageId: string }>();
  const navigate = useNavigate();
  const {
    images, classes, setImages,
    fetchProjectDetails, fetchProjectImages, fetchStats,
    setErrorModal,
  } = useAppContext();

  const pid = Number(projectId);
  const imgId = Number(imageId);

  const [editorDirty, setEditorDirty] = useState(false);

  // Ref for synchronous dirty check — bypasses React's async state batching.
  // When the editor is about to navigate between images (auto-advance, arrow
  // keys), it sets this to true *before* calling navigate(), so the blocker
  // function reads the up-to-date value and skips blocking.
  const navigatingWithinEditor = useRef(false);

  // Load project details and ALL images on mount (ignore gallery filter)
  useEffect(() => {
    if (pid) {
      fetchProjectDetails(pid);
      fetchProjectImages(pid, 'all');
      fetchStats(pid);
    }
  }, [pid, fetchProjectDetails, fetchProjectImages, fetchStats]);

  // Block router navigation when editor is dirty, but not during internal
  // image-to-image navigation (auto-advance, arrow keys, thumbnail clicks).
  const blocker = useBlocker(() => {
    if (navigatingWithinEditor.current) return false;
    return editorDirty;
  });

  const handleSaveAndExit = useCallback(() => {
    navigatingWithinEditor.current = false;
    navigate(`/projects/${pid}`);
    fetchProjectImages(pid);
    fetchStats(pid);
  }, [navigate, pid, fetchProjectImages, fetchStats]);

  const handleImageChange = useCallback((newImageId: number) => {
    navigate(`/projects/${pid}/images/${newImageId}`, { replace: true });
    // Reset the bypass flag after navigation is initiated, so subsequent
    // external navigations (Gallery link, browser back) are properly blocked.
    setTimeout(() => { navigatingWithinEditor.current = false; }, 0);
  }, [navigate, pid]);

  // Called by the editor hook BEFORE navigate() during internal navigation
  // (auto-advance, arrow keys, thumbnail clicks). Sets the bypass flag so
  // the blocker function returns false.
  const handleBeforeNavigate = useCallback(() => {
    navigatingWithinEditor.current = true;
  }, []);

  return (
    <>
      <Editor
        currentImageId={imgId}
        images={images}
        classes={classes}
        onSaveAndExit={handleSaveAndExit}
        onImageChange={handleImageChange}
        onBeforeNavigate={handleBeforeNavigate}
        setImages={setImages}
        onError={(title, message) => setErrorModal({ title, message })}
        onDirtyChange={setEditorDirty}
      />

      {/* Unsaved changes guard modal */}
      <ConfirmModal
        isOpen={blocker.state === 'blocked'}
        title="Unsaved Changes"
        message="You have unsaved annotation changes. Leave the editor without saving? Your changes will be lost."
        confirmLabel="Discard & Leave"
        cancelLabel="Keep Editing"
        variant="danger"
        onConfirm={() => blocker.proceed?.()}
        onClose={() => blocker.reset?.()}
      />
    </>
  );
}
