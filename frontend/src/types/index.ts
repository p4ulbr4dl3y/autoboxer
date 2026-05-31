export interface Project {
  id: number;
  name: string;
  description: string | null;
  default_prompt: string;
  created_at: string;
  classes: ClassCategory[];
}

export interface ClassCategory {
  id: number;
  project_id: number;
  name: string;
  color: string;
  prompt?: string;
}

export interface ImageItem {
  id: number;
  project_id: number;
  filename: string;
  filepath: string;
  width: number | null;
  height: number | null;
  status: 'unlabeled' | 'labeled' | 'in_progress';
  created_at: string;
}

export interface Annotation {
  id: number | string; // string for temp frontend IDs
  image_id: number;
  box_id: number;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  label: string | null;
  color?: string; // transient color mapped from class
}

export interface ProjectStats {
  project_id: number;
  name: string;
  total_images: number;
  unlabeled_images: number;
  labeled_images: number;
  in_progress_images: number;
  batch_in_progress: boolean;
}
