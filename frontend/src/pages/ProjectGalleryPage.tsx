import { useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAppContext } from '../context/AppContext';
import ProjectGallery from '../components/ProjectGallery';

export default function ProjectGalleryPage() {
  const { projectId } = useParams<{ projectId: string }>();
  const navigate = useNavigate();
  const {
    projects, stats, images, classes,
    statusFilter, setStatusFilter, setClasses,
    fetchProjectDetails, fetchProjectImages, fetchStats,
    setDeleteClassInfo, setErrorModal,
    isBatchLabeling, handleBatchLabel,
  } = useAppContext();

  const pid = Number(projectId);
  const project = projects.find(p => p.id === pid);

  useEffect(() => {
    if (pid) {
      fetchProjectDetails(pid);
      fetchStats(pid);
    }
  }, [pid, fetchProjectDetails, fetchStats]);

  // Refetch images when status filter changes
  useEffect(() => {
    if (pid) {
      fetchProjectImages(pid);
    }
  }, [statusFilter, pid, fetchProjectImages]);

  if (!project) return null;

  return (
    <ProjectGallery
      project={project}
      stats={stats[pid]}
      images={images}
      classes={classes}
      statusFilter={statusFilter}
      isBatchLabeling={isBatchLabeling}
      setStatusFilter={setStatusFilter}
      setClasses={setClasses}
      onOpenEditor={imageId => navigate(`/projects/${pid}/images/${imageId}`)}
      onBatchLabel={handleBatchLabel}
      onDeleteClass={classId => {
        const cls = classes.find(c => c.id === classId);
        if (cls) setDeleteClassInfo({ id: classId, name: cls.name });
      }}
      onRefresh={() => { fetchProjectDetails(pid); fetchStats(pid); }}
      onError={(title, message) => setErrorModal({ title, message })}
    />
  );
}
