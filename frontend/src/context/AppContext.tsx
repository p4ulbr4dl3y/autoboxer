/* eslint-disable react-refresh/only-export-components */
import { createContext, useContext } from 'react';
import type { Project, ProjectStats, ClassCategory, ImageItem } from '../types';

interface AppContextType {
  // Projects
  projects: Project[];
  stats: Record<number, ProjectStats>;
  fetchProjects: () => Promise<void>;
  fetchStats: (id: number) => Promise<void>;
  deleteProject: (id: number) => Promise<void>;

  // Project detail (current project)
  images: ImageItem[];
  setImages: React.Dispatch<React.SetStateAction<ImageItem[]>>;
  classes: ClassCategory[];
  setClasses: React.Dispatch<React.SetStateAction<ClassCategory[]>>;
  statusFilter: string;
  setStatusFilter: (f: string) => void;
  fetchProjectDetails: (id: number) => Promise<void>;
  fetchProjectImages: (id: number, filter?: string) => Promise<void>;

  // Modals
  deleteProjectId: number | null;
  setDeleteProjectId: (id: number | null) => void;
  deleteClassInfo: { id: number; name: string } | null;
  setDeleteClassInfo: (info: { id: number; name: string } | null) => void;
  errorModal: { title: string; message: string } | null;
  setErrorModal: (modal: { title: string; message: string } | null) => void;

  // Batch labeling
  isBatchLabeling: boolean;
  handleBatchLabel: (config: {
    target_images: 'all' | 'unlabeled';
    mode: 'merge' | 'overwrite';
    target_classes: string[];
  }) => Promise<void>;
}

const AppContext = createContext<AppContextType | null>(null);

export function useAppContext() {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('useAppContext must be used within AppContext.Provider');
  return ctx;
}

export default AppContext;
