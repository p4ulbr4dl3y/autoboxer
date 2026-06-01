import { useState, useCallback, useEffect } from 'react';
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

  // Load project details on mount
  useEffect(() => {
    if (pid) {
      fetchProjectDetails(pid);
      fetchStats(pid);
    }
  }, [pid, fetchProjectDetails, fetchStats]);

  // Block router navigation when editor is dirty
  const blocker = useBlocker(editorDirty);

  const handleSaveAndExit = useCallback(() => {
    navigate(`/projects/${pid}`);
    fetchProjectImages(pid);
    fetchStats(pid);
  }, [navigate, pid, fetchProjectImages, fetchStats]);

  const handleImageChange = useCallback((newImageId: number) => {
    navigate(`/projects/${pid}/images/${newImageId}`, { replace: true });
  }, [navigate, pid]);

  return (
    <>
      <Editor
        currentImageId={imgId}
        images={images}
        classes={classes}
        onSaveAndExit={handleSaveAndExit}
        onImageChange={handleImageChange}
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
