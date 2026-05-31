import { useState, useEffect, useCallback } from 'react';
import { api } from '../api/client';
import type { Project, ProjectStats, ClassCategory, ImageItem } from '../types';

export function useProjects() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [stats, setStats] = useState<Record<number, ProjectStats>>({});

  const fetchProjects = useCallback(async () => {
    try {
      const data = await api.projects.list();
      setProjects(data);
      data.forEach((p: Project) => fetchStats(p.id));
    } catch (e) {
      console.error(e);
    }
  }, []);

  const fetchStats = useCallback(async (id: number) => {
    try {
      const data = await api.projects.stats(id);
      setStats(prev => ({ ...prev, [id]: data }));
    } catch (e) {
      console.error(e);
    }
  }, []);

  useEffect(() => {
    fetchProjects();
  }, [fetchProjects]);

  const deleteProject = useCallback(async (id: number) => {
    await api.projects.delete(id);
    fetchProjects();
  }, [fetchProjects]);

  return { projects, stats, fetchProjects, fetchStats, deleteProject };
}

export function useProjectDetail(projectId: number | null) {
  const [images, setImages] = useState<ImageItem[]>([]);
  const [classes, setClasses] = useState<ClassCategory[]>([]);
  const [statusFilter, setStatusFilter] = useState<string>('all');

  const fetchProjectDetails = useCallback(async (pid: number) => {
    try {
      const proj = await api.projects.get(pid);
      setClasses(proj.classes);
      await fetchProjectImages(pid);
    } catch (e) {
      console.error(e);
    }
  }, []);

  const fetchProjectImages = useCallback(async (pid: number) => {
    try {
      const data = await api.images.list(pid, statusFilter);
      setImages(data);
    } catch (e) {
      console.error(e);
    }
  }, [statusFilter]);

  useEffect(() => {
    if (projectId) {
      fetchProjectImages(projectId);
    }
  }, [statusFilter, projectId, fetchProjectImages]);

  return {
    images,
    setImages,
    classes,
    setClasses,
    statusFilter,
    setStatusFilter,
    fetchProjectDetails,
    fetchProjectImages,
  };
}
