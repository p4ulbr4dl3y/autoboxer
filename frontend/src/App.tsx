import React, { useState, useEffect, useRef } from 'react';
import './App.css';

const API_URL = 'http://localhost:8000';

interface Project {
  id: number;
  name: string;
  description: string | null;
  default_prompt: string;
  created_at: string;
  classes: ClassCategory[];
}

interface ClassCategory {
  id: number;
  project_id: number;
  name: string;
  color: string;
  prompt?: string;
}

interface ImageItem {
  id: number;
  project_id: number;
  filename: string;
  filepath: string;
  width: number | null;
  height: number | null;
  status: 'unlabeled' | 'labeled' | 'in_progress';
  created_at: string;
}

interface Annotation {
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

interface ProjectStats {
  project_id: number;
  name: string;
  total_images: number;
  unlabeled_images: number;
  labeled_images: number;
  in_progress_images: number;
  batch_in_progress: boolean;
}

export default function App() {
  // Navigation
  const [view, setView] = useState<'dashboard' | 'project' | 'editor'>('dashboard');
  const [selectedProjectId, setSelectedProjectId] = useState<number | null>(null);
  
  // Projects
  const [projects, setProjects] = useState<Project[]>([]);
  const [stats, setStats] = useState<Record<number, ProjectStats>>({});
  const [newProjectName, setNewProjectName] = useState('');
  const [newProjectDesc, setNewProjectDesc] = useState('');
  const [newProjectPrompt, setNewProjectPrompt] = useState('Locate objects.');
  const [newProjectClasses, setNewProjectClasses] = useState<{ name: string; prompt: string; color: string }[]>([
    { name: '', prompt: '', color: '#34C759' }
  ]);
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);

  // Batch Auto-Label options modal
  const [isBatchModalOpen, setIsBatchModalOpen] = useState(false);
  const [batchPrompt, setBatchPrompt] = useState('');
  const [batchTargetImages, setBatchTargetImages] = useState<'unlabeled' | 'all'>('unlabeled');
  const [batchMode, setBatchMode] = useState<'overwrite' | 'merge'>('overwrite');
  const [batchFilterByClasses, setBatchFilterByClasses] = useState(true);
  const [batchTargetClasses, setBatchTargetClasses] = useState<string[]>([]);

  // Editor AI Settings
  const [editorLabelMode, setEditorLabelMode] = useState<'overwrite' | 'merge'>('overwrite');
  const [editorFilterByClasses, setEditorFilterByClasses] = useState(true);
  const [editorTargetClassOption, setEditorTargetClassOption] = useState<'all' | 'active'>('all');

  // Project Detail
  const [images, setImages] = useState<ImageItem[]>([]);
  const [classes, setClasses] = useState<ClassCategory[]>([]);
  const [newClassName, setNewClassName] = useState('');
  const [newClassColor, setNewClassColor] = useState('#34C759');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [uploadFiles, setUploadFiles] = useState<FileList | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [isBatchLabeling, setIsBatchLabeling] = useState(false);

  // Editor
  const [currentImageId, setCurrentImageId] = useState<number | null>(null);
  const [annotations, setAnnotations] = useState<Annotation[]>([]);
  const [selectedAnnId, setSelectedAnnId] = useState<number | string | null>(null);
  
  // Editor AI Overrides
  const [editorPrompt, setEditorPrompt] = useState('');
  const [isAiRunning, setIsAiRunning] = useState(false);
  
  // Active Canvas Modes
  const [canvasMode, setCanvasMode] = useState<'select' | 'draw'>('select');
  const [activeClass, setActiveClass] = useState<string>('');
  
  // Canvas DOM sizing
  const [renderedWidth, setRenderedWidth] = useState(0);
  const [renderedHeight, setRenderedHeight] = useState(0);
  const imageContainerRef = useRef<HTMLDivElement>(null);
  const imageRef = useRef<HTMLImageElement>(null);

  // Drawing Box state
  const [isDrawing, setIsDrawing] = useState(false);
  const [drawStart, setDrawStart] = useState({ x: 0, y: 0 });
  const [drawEnd, setDrawEnd] = useState({ x: 0, y: 0 });

  // Resizing state
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const [draggedAnnId, setDraggedAnnId] = useState<number | string | null>(null);
  const [dragMode, setDragMode] = useState<'move' | 'nw' | 'ne' | 'se' | 'sw'>('move');
  const [dragInitialBox, setDragInitialBox] = useState({ x1: 0, y1: 0, x2: 0, y2: 0 });

  // Fetch projects list
  const fetchProjects = async () => {
    try {
      const res = await fetch(`${API_URL}/api/v1/projects`);
      if (res.ok) {
        const data = await res.json();
        setProjects(data);
        data.forEach((p: Project) => fetchStats(p.id));
      }
    } catch (e) {
      console.error(e);
    }
  };

  // Fetch stats for a project
  const fetchStats = async (id: number) => {
    try {
      const res = await fetch(`${API_URL}/api/v1/projects/${id}/stats`);
      if (res.ok) {
        const data = await res.json();
        setStats(prev => ({ ...prev, [id]: data }));
      }
    } catch (e) {
      console.error(e);
    }
  };

  useEffect(() => {
    fetchProjects();
  }, []);

  // Poll stats if batch labeling is active
  useEffect(() => {
    if (!selectedProjectId) return;

    const statsData = stats[selectedProjectId];
    const isRunning = isBatchLabeling || (statsData && statsData.batch_in_progress);

    if (!isRunning) return;

    let active = true;
    let timerId: any;

    const poll = async () => {
      try {
        const statsRes = await fetch(`${API_URL}/api/v1/projects/${selectedProjectId}/stats`);
        if (!active) return;
        if (statsRes.ok) {
          const newStatsData = await statsRes.json();
          setStats(prev => ({ ...prev, [selectedProjectId]: newStatsData }));
          
          if (newStatsData.batch_in_progress === false) {
            setIsBatchLabeling(false);
            // Fetch final image states
            const imagesRes = await fetch(`${API_URL}/api/v1/projects/${selectedProjectId}/images`);
            if (imagesRes.ok) {
              const imagesData = await imagesRes.json();
              setImages(imagesData);
            }
            active = false;
            return;
          }
        }
        
        const imagesRes = await fetch(`${API_URL}/api/v1/projects/${selectedProjectId}/images`);
        if (!active) return;
        if (imagesRes.ok) {
          const imagesData = await imagesRes.json();
          setImages(imagesData);
        }
      } catch (e) {
        console.error("Polling error:", e);
      }
      
      if (active) {
        timerId = setTimeout(poll, 2000);
      }
    };

    timerId = setTimeout(poll, 2000);

    return () => {
      active = false;
      clearTimeout(timerId);
    };
  }, [isBatchLabeling, selectedProjectId, selectedProjectId ? stats[selectedProjectId]?.batch_in_progress : undefined]);

  // Load project details (images, classes)
  const fetchProjectDetails = async (projectId: number) => {
    try {
      const res = await fetch(`${API_URL}/api/v1/projects/${projectId}`);
      if (res.ok) {
        const proj = await res.json();
        setClasses(proj.classes);
        if (proj.classes.length > 0) {
          setActiveClass(proj.classes[0].name);
        }
        setEditorPrompt(proj.default_prompt);
      }
      await fetchProjectImages(projectId);
      await fetchStats(projectId);
    } catch (e) {
      console.error(e);
    }
  };

  const fetchProjectImages = async (projectId: number) => {
    try {
      const filterParam = statusFilter !== 'all' ? `?status=${statusFilter}` : '';
      const res = await fetch(`${API_URL}/api/v1/projects/${projectId}/images${filterParam}`);
      if (res.ok) {
        const data = await res.json();
        setImages(data);
      }
    } catch (e) {
      console.error(e);
    }
  };

  useEffect(() => {
    if (selectedProjectId) {
      fetchProjectImages(selectedProjectId);
    }
  }, [statusFilter]);

  // Sync editor prompt with class selection option
  useEffect(() => {
    if (!selectedProjectId) return;
    if (editorTargetClassOption === 'active' && activeClass) {
      setEditorPrompt(`Locate ${activeClass.toLowerCase()}.`);
    } else if (editorTargetClassOption === 'all') {
      const classNames = classes.map(c => c.name.toLowerCase());
      if (classNames.length > 0) {
        setEditorPrompt(`Locate ${classNames.join(' and ')}.`);
      } else {
        const proj = projects.find(p => p.id === selectedProjectId);
        setEditorPrompt(proj?.default_prompt || 'Locate objects.');
      }
    }
  }, [editorTargetClassOption, activeClass, selectedProjectId, classes, projects]);

  // Create new project
  const handleCreateProject = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newProjectName) return;

    const classesList = newProjectClasses
      .map(cls => ({
        name: cls.name.trim(),
        prompt: cls.prompt.trim() || `Locate ${cls.name.trim()}.`,
        color: cls.color
      }))
      .filter(cls => cls.name.length > 0);

    if (classesList.length === 0) {
      alert('Please specify at least one class category.');
      return;
    }

    try {
      const res = await fetch(`${API_URL}/api/v1/projects`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: newProjectName,
          description: newProjectDesc || null,
          default_prompt: newProjectPrompt,
          classes: classesList,
        }),
      });
      if (res.ok) {
        setNewProjectName('');
        setNewProjectDesc('');
        setNewProjectPrompt('Locate objects.');
        setNewProjectClasses([{ name: '', prompt: '', color: '#34C759' }]);
        setIsCreateModalOpen(false);
        fetchProjects();
      } else {
        const error = await res.json();
        alert(`Error: ${error.detail}`);
      }
    } catch (e) {
      console.error(e);
    }
  };

  // Update a class category prompt
  const handleUpdateClassPrompt = async (classId: number, newPrompt: string) => {
    try {
      const res = await fetch(`${API_URL}/api/v1/classes/${classId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt: newPrompt
        }),
      });
      if (res.ok) {
        const updated = await res.json();
        setClasses(prev => prev.map(c => c.id === classId ? updated : c));
      } else {
        const err = await res.json();
        console.error('Failed to update class prompt:', err.detail);
      }
    } catch (e) {
      console.error(e);
    }
  };

  // Add class category to project
  const handleAddClass = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newClassName || !selectedProjectId) return;
    try {
      const res = await fetch(`${API_URL}/api/v1/projects/${selectedProjectId}/classes`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: newClassName,
          color: newClassColor,
        }),
      });
      if (res.ok) {
        setNewClassName('');
        const added = await res.json();
        setClasses(prev => [...prev, added]);
        setActiveClass(added.name);
      } else {
        const err = await res.json();
        alert(err.detail);
      }
    } catch (e) {
      console.error(e);
    }
  };

  // Upload Images
  const handleUploadImages = async () => {
    if (!uploadFiles || !selectedProjectId) return;
    setIsUploading(true);
    const formData = new FormData();
    for (let i = 0; i < uploadFiles.length; i++) {
      formData.append('files', uploadFiles[i]);
    }
    try {
      const res = await fetch(`${API_URL}/api/v1/projects/${selectedProjectId}/upload-images`, {
        method: 'POST',
        body: formData,
      });
      if (res.ok) {
        setUploadFiles(null);
        const fileInput = document.getElementById('file-upload-input') as HTMLInputElement;
        if (fileInput) fileInput.value = '';
        
        await fetchProjectDetails(selectedProjectId);
        await fetchStats(selectedProjectId);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setIsUploading(false);
    }
  };

  // Trigger batch labeling
  const handleBatchLabel = async (
    prompt: string,
    targetImages: 'unlabeled' | 'all',
    mode: 'overwrite' | 'merge',
    filterByClasses: boolean,
    targetClasses: string[]
  ) => {
    if (!selectedProjectId) return;
    setIsBatchLabeling(true);
    try {
      const res = await fetch(`${API_URL}/api/v1/projects/${selectedProjectId}/auto-label-all`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt,
          target_images: targetImages,
          mode,
          filter_by_classes: filterByClasses,
          target_classes: targetClasses,
        }),
      });
      if (res.ok) {
        await fetchStats(selectedProjectId);
      } else {
        const error = await res.json();
        alert(`Error starting batch auto-label: ${error.detail}`);
        setIsBatchLabeling(false);
      }
    } catch (e) {
      console.error(e);
      setIsBatchLabeling(false);
    }
  };

  const handleToggleBatchClass = (className: string) => {
    const isChecked = batchTargetClasses.includes(className);
    const nextClasses = isChecked 
      ? batchTargetClasses.filter(c => c !== className)
      : [...batchTargetClasses, className];
    
    setBatchTargetClasses(nextClasses);
  };

  // Export Dataset
  const handleExport = (format: 'yolo' | 'coco') => {
    if (!selectedProjectId) return;
    window.open(`${API_URL}/api/v1/projects/${selectedProjectId}/export?format=${format}`);
  };

  // Delete project
  const handleDeleteProject = async (id: number) => {
    if (!confirm('Are you sure you want to delete this project? All images and annotations will be deleted.')) return;
    try {
      const res = await fetch(`${API_URL}/api/v1/projects/${id}`, {
        method: 'DELETE',
      });
      if (res.ok) {
        fetchProjects();
      }
    } catch (e) {
      console.error(e);
    }
  };

  // --- EDITOR STATE ---

  const currentImage = images.find(img => img.id === currentImageId);
  const currentImageIndex = images.findIndex(img => img.id === currentImageId);

  // Load annotations for image
  const fetchAnnotations = async (imageId: number) => {
    try {
      const res = await fetch(`${API_URL}/api/v1/images/${imageId}/annotations`);
      if (res.ok) {
        const data = await res.json();
        const mapped = data.map((ann: Annotation) => {
          const cls = classes.find(c => c.name === ann.label);
          return { ...ann, color: cls ? cls.color : '#34C759' };
        });
        setAnnotations(mapped);
        if (mapped.length > 0) {
          setSelectedAnnId(mapped[0].id);
        } else {
          setSelectedAnnId(null);
        }
      }
    } catch (e) {
      console.error(e);
    }
  };

  useEffect(() => {
    if (view === 'editor' && currentImageId) {
      fetchAnnotations(currentImageId);
    }
  }, [currentImageId, view]);

  // Run AI Auto-label on current image
  const handleAutoLabelCurrent = async () => {
    if (!currentImageId) return;
    setIsAiRunning(true);
    try {
      const params = new URLSearchParams();
      if (editorPrompt) params.append('prompt', editorPrompt);
      params.append('mode', editorLabelMode);
      params.append('filter_by_classes', editorFilterByClasses.toString());
      if (editorTargetClassOption === 'active' && activeClass) {
        params.append('target_classes', activeClass);
      }

      const res = await fetch(`${API_URL}/api/v1/images/${currentImageId}/auto-label?${params.toString()}`, {
        method: 'POST',
      });
      if (res.ok) {
        const data = await res.json();
        const mapped = data.map((ann: Annotation) => {
          const cls = classes.find(c => c.name === ann.label);
          return { ...ann, color: cls ? cls.color : '#34C759' };
        });
        setAnnotations(mapped);
        if (mapped.length > 0) {
          setSelectedAnnId(mapped[0].id);
        }
        setImages(prev => prev.map(img => img.id === currentImageId ? { ...img, status: 'labeled' } : img));
      }
    } catch (e) {
      console.error(e);
    } finally {
      setIsAiRunning(false);
    }
  };

  // Save current annotations
  const handleSaveAnnotations = async () => {
    if (!currentImageId) return;
    try {
      const cleaned = annotations.map((ann, index) => ({
        box_id: index + 1,
        x1: Math.round(ann.x1),
        y1: Math.round(ann.y1),
        x2: Math.round(ann.x2),
        y2: Math.round(ann.y2),
        label: ann.label,
      }));

      const res = await fetch(`${API_URL}/api/v1/images/${currentImageId}/annotations`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(cleaned),
      });

      if (res.ok) {
        setImages(prev => prev.map(img => img.id === currentImageId ? { ...img, status: 'labeled' } : img));
        if (selectedProjectId) fetchStats(selectedProjectId);
        return true;
      }
    } catch (e) {
      console.error(e);
    }
    return false;
  };

  // Next image
  const handleNextImage = async () => {
    const saved = await handleSaveAnnotations();
    if (saved && currentImageIndex < images.length - 1) {
      setCurrentImageId(images[currentImageIndex + 1].id);
    }
  };

  // Prev image
  const handlePrevImage = async () => {
    const saved = await handleSaveAnnotations();
    if (saved && currentImageIndex > 0) {
      setCurrentImageId(images[currentImageIndex - 1].id);
    }
  };

  // Canvas size trackers
  const updateRenderedDimensions = () => {
    if (imageRef.current) {
      setRenderedWidth(imageRef.current.clientWidth);
      setRenderedHeight(imageRef.current.clientHeight);
    }
  };

  useEffect(() => {
    window.addEventListener('resize', updateRenderedDimensions);
    return () => window.removeEventListener('resize', updateRenderedDimensions);
  }, []);

  // --- CANVAS HANDLERS (Drawing / Dragging) ---

  const getCanvasMouseCoords = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!imageContainerRef.current) return { x: 0, y: 0 };
    const rect = imageContainerRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    return {
      x: Math.max(0, Math.min(renderedWidth, x)),
      y: Math.max(0, Math.min(renderedHeight, y)),
    };
  };

  const handleCanvasMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
    const coords = getCanvasMouseCoords(e);
    
    if (canvasMode === 'draw') {
      setIsDrawing(true);
      setDrawStart(coords);
      setDrawEnd(coords);
    } else if (canvasMode === 'select') {
      const clickedAnn = findAnnotationAtCoords(coords.x, coords.y);
      if (clickedAnn) {
        setSelectedAnnId(clickedAnn.id);
        
        setIsDragging(true);
        setDraggedAnnId(clickedAnn.id);
        setDragStart(coords);
        setDragInitialBox({
          x1: clickedAnn.x1,
          y1: clickedAnn.y1,
          x2: clickedAnn.x2,
          y2: clickedAnn.y2,
        });
        setDragMode('move');
      } else {
        setSelectedAnnId(null);
      }
    }
  };

  const handleCanvasMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    const coords = getCanvasMouseCoords(e);

    if (isDrawing) {
      setDrawEnd(coords);
    } else if (isDragging && draggedAnnId && currentImage) {
      const deltaX = coords.x - dragStart.x;
      const deltaY = coords.y - dragStart.y;
      
      const origW = currentImage.width || 1;
      const origH = currentImage.height || 1;
      
      const deltaOrigX = (deltaX / renderedWidth) * origW;
      const deltaOrigY = (deltaY / renderedHeight) * origH;
      
      setAnnotations(prev =>
        prev.map(ann => {
          if (ann.id === draggedAnnId) {
            let newX1 = dragInitialBox.x1;
            let newY1 = dragInitialBox.y1;
            let newX2 = dragInitialBox.x2;
            let newY2 = dragInitialBox.y2;
            
            if (dragMode === 'move') {
              newX1 += deltaOrigX;
              newX2 += deltaOrigX;
              newY1 += deltaOrigY;
              newY2 += deltaOrigY;
              
              if (newX1 < 0) {
                newX2 -= newX1;
                newX1 = 0;
              }
              if (newX2 > origW) {
                newX1 -= (newX2 - origW);
                newX2 = origW;
              }
              if (newY1 < 0) {
                newY2 -= newY1;
                newY1 = 0;
              }
              if (newY2 > origH) {
                newY1 -= (newY2 - origH);
                newY2 = origH;
              }
            } else if (dragMode === 'se') {
              newX2 = Math.max(newX1 + 10, dragInitialBox.x2 + deltaOrigX);
              newY2 = Math.max(newY1 + 10, dragInitialBox.y2 + deltaOrigY);
            }
            
            return {
              ...ann,
              x1: Math.max(0, Math.min(origW, newX1)),
              y1: Math.max(0, Math.min(origH, newY1)),
              x2: Math.max(0, Math.min(origW, newX2)),
              y2: Math.max(0, Math.min(origH, newY2)),
            };
          }
          return ann;
        })
      );
    }
  };

  const handleCanvasMouseUp = () => {
    if (isDrawing && currentImage) {
      setIsDrawing(false);
      
      const origW = currentImage.width || 1;
      const origH = currentImage.height || 1;

      const x1 = Math.min(drawStart.x, drawEnd.x);
      const y1 = Math.min(drawStart.y, drawEnd.y);
      const x2 = Math.max(drawStart.x, drawEnd.x);
      const y2 = Math.max(drawStart.y, drawEnd.y);
      
      const origX1 = (x1 / renderedWidth) * origW;
      const origY1 = (y1 / renderedHeight) * origH;
      const origX2 = (x2 / renderedWidth) * origW;
      const origY2 = (y2 / renderedHeight) * origH;

      if (origX2 - origX1 > 10 && origY2 - origY1 > 10) {
        const cls = classes.find(c => c.name === activeClass);
        const tempId = `temp_${Date.now()}`;
        const newAnn: Annotation = {
          id: tempId,
          image_id: currentImage.id,
          box_id: annotations.length + 1,
          x1: Math.round(origX1),
          y1: Math.round(origY1),
          x2: Math.round(origX2),
          y2: Math.round(origY2),
          label: activeClass || 'object',
          color: cls ? cls.color : '#34C759',
        };
        setAnnotations(prev => [...prev, newAnn]);
        setSelectedAnnId(tempId);
      }
      setCanvasMode('select');
    }
    
    setIsDragging(false);
    setDraggedAnnId(null);
  };

  // Helper to find annotation box clicked
  const findAnnotationAtCoords = (x: number, y: number): Annotation | null => {
    if (!currentImage) return null;
    const origW = currentImage.width || 1;
    const origH = currentImage.height || 1;
    
    const origX = (x / renderedWidth) * origW;
    const origY = (y / renderedHeight) * origH;

    for (let i = annotations.length - 1; i >= 0; i--) {
      const ann = annotations[i];
      if (origX >= ann.x1 && origX <= ann.x2 && origY >= ann.y1 && origY <= ann.y2) {
        return ann;
      }
    }
    return null;
  };

  // Delete Annotation
  const handleDeleteAnnotation = (id: number | string) => {
    setAnnotations(prev => prev.filter(ann => ann.id !== id));
    if (selectedAnnId === id) {
      setSelectedAnnId(null);
    }
  };

  // Change class of selected annotation
  const handleChangeSelectedClass = (className: string) => {
    if (selectedAnnId === null) return;
    const cls = classes.find(c => c.name === className);
    setAnnotations(prev =>
      prev.map(ann =>
        ann.id === selectedAnnId
          ? { ...ann, label: className, color: cls ? cls.color : '#34C759' }
          : ann
      )
    );
  };

  // Save before navigating using header
  const handleHeaderNavigate = async (targetView: 'dashboard' | 'project') => {
    if (view === 'editor') {
      await handleSaveAnnotations();
    }
    if (targetView === 'dashboard') {
      setSelectedProjectId(null);
    }
    setView(targetView);
  };

  // Keyboard navigation / deletions
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (view !== 'editor') return;
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;

      if (e.key === 'Delete' || e.key === 'Backspace') {
        if (selectedAnnId !== null) {
          handleDeleteAnnotation(selectedAnnId);
        }
      } else if (e.key === 'ArrowRight') {
        handleNextImage();
      } else if (e.key === 'ArrowLeft') {
        handlePrevImage();
      } else if (e.key === 'Enter') {
        if (currentImageIndex < images.length - 1) {
          handleNextImage();
        } else {
          (async () => {
            const saved = await handleSaveAnnotations();
            if (saved) setView('project');
          })();
        }
      } else if (e.key === 'd' || e.key === 'в') {
        setCanvasMode('draw');
      } else if (e.key === 's' || e.key === 'ы') {
        setCanvasMode('select');
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [
    selectedAnnId,
    annotations,
    currentImageId,
    view,
    currentImageIndex,
    images,
    handleDeleteAnnotation,
    handleNextImage,
    handlePrevImage,
    handleSaveAnnotations,
    setView
  ]);

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans">
      {/* Header */}
      <header className="border-b border-slate-800 bg-slate-900/60 backdrop-blur-md px-6 py-4 flex items-center justify-between sticky top-0 z-50">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-violet-600 to-indigo-600 flex items-center justify-center shadow-lg shadow-indigo-500/20">
            <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 5a1 1 0 011-1h14a1 1 0 011 1v2a1 1 0 01-1 1H5a1 1 0 01-1-1V5zM4 13a1 1 0 011-1h6a1 1 0 011 1v6a1 1 0 01-1 1H5a1 1 0 01-1-1v-6zM16 13a1 1 0 011-1h2a1 1 0 011 1v6a1 1 0 01-1 1h-2a1 1 0 01-1-1v-6z" />
            </svg>
          </div>
          <div>
            <h1 className="text-xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-slate-50 to-slate-200">Autoboxer</h1>
            <p className="text-xs text-slate-400">Model-Assisted Image Labeling Studio</p>
          </div>
        </div>
        <div className="flex items-center gap-4">
          <button 
            onClick={() => handleHeaderNavigate('dashboard')}
            className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-all duration-200 ${view === 'dashboard' ? 'bg-slate-800 text-white border border-slate-700' : 'text-slate-400 hover:text-white'}`}
          >
            Dashboard
          </button>
          {selectedProjectId && (
            <button 
              onClick={() => handleHeaderNavigate('project')}
              className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-all duration-200 ${view === 'project' ? 'bg-slate-800 text-white border border-slate-700' : 'text-slate-400 hover:text-white'}`}
            >
              Gallery
            </button>
          )}
        </div>
      </header>

      {/* Main Body */}
      <main className="flex-1 flex flex-col">
        {view === 'dashboard' && (
          <div className="max-w-6xl mx-auto px-6 py-10 w-full flex-1 flex flex-col justify-between">
            <div>
              <div className="flex justify-between items-center mb-8">
                <div>
                  <h2 className="text-2xl font-bold">Your Datasets</h2>
                  <p className="text-slate-400 text-sm">Select a project to begin labeling or uploading image sets</p>
                </div>
                <button
                  onClick={() => setIsCreateModalOpen(true)}
                  className="bg-indigo-600 hover:bg-indigo-500 hover:shadow-lg hover:shadow-indigo-500/20 active:scale-95 text-white font-medium px-4 py-2 rounded-xl text-sm flex items-center gap-2 transition-all duration-200"
                >
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                  </svg>
                  Create Project
                </button>
              </div>

              {projects.length === 0 ? (
                <div className="text-center py-20 bg-slate-900/40 border border-slate-850 rounded-2xl">
                  <svg className="w-12 h-12 mx-auto text-slate-600 mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4" />
                  </svg>
                  <h3 className="text-lg font-medium text-slate-350">No projects yet</h3>
                  <p className="text-slate-500 text-sm mt-1">Get started by creating your first image labeling project</p>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                  {projects.map((proj) => {
                    const pStats = stats[proj.id];
                    const percent = pStats && pStats.total_images > 0 
                      ? Math.round((pStats.labeled_images / pStats.total_images) * 100) 
                      : 0;
                    return (
                      <div 
                        key={proj.id}
                        className="bg-slate-900/60 border border-slate-800 rounded-2xl p-6 flex flex-col justify-between hover:border-slate-700 hover:shadow-xl hover:shadow-slate-950/40 hover:-translate-y-0.5 group transition-all duration-300"
                      >
                        <div>
                          <div className="flex justify-between items-start mb-3">
                            <h3 className="font-bold text-lg text-slate-100 group-hover:text-indigo-400 transition-colors duration-200">{proj.name}</h3>
                            <button
                              onClick={(e) => { e.stopPropagation(); handleDeleteProject(proj.id); }}
                              className="text-slate-500 hover:text-red-400 p-1.5 rounded-lg hover:bg-slate-800/80 transition-all"
                            >
                              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                              </svg>
                            </button>
                          </div>
                          <p className="text-slate-400 text-sm line-clamp-2 mb-6 h-10">{proj.description || "No description provided."}</p>
                        </div>
                        <div>
                          <div className="mb-4">
                            <div className="flex justify-between text-xs font-semibold text-slate-400 mb-1.5">
                              <span>Progress</span>
                              <span>{pStats ? `${pStats.labeled_images}/${pStats.total_images}` : '0/0'} images</span>
                            </div>
                            <div className="w-full bg-slate-800 rounded-full h-2 overflow-hidden border border-slate-750">
                              <div 
                                className="bg-gradient-to-r from-violet-500 to-indigo-500 h-full rounded-full transition-all duration-500" 
                                style={{ width: `${percent}%` }}
                              />
                            </div>
                          </div>
                          <button
                            onClick={() => { setSelectedProjectId(proj.id); fetchProjectDetails(proj.id); setView('project'); }}
                            className="w-full bg-slate-800 hover:bg-indigo-600 hover:text-white border border-slate-750 hover:border-transparent text-slate-350 font-semibold py-2 rounded-xl text-sm transition-all duration-200"
                          >
                            Open Project
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Create Project Modal */}
            {isCreateModalOpen && (
              <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center z-50 p-4 animate-fadeIn">
                <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-lg shadow-2xl p-6 relative">
                  <button
                    onClick={() => setIsCreateModalOpen(false)}
                    className="absolute top-4 right-4 text-slate-400 hover:text-white"
                  >
                    <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                  <h3 className="text-xl font-bold mb-4">Create New Project</h3>
                  <form onSubmit={handleCreateProject} className="space-y-4">
                    <div>
                      <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">Project Name</label>
                      <input 
                        type="text" 
                        required 
                        value={newProjectName} 
                        onChange={(e) => setNewProjectName(e.target.value)}
                        placeholder="e.g. Traffic Sign Detection"
                        className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-2.5 text-sm text-slate-100 focus:outline-none focus:border-indigo-500 transition-colors"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">Description</label>
                      <textarea 
                        value={newProjectDesc} 
                        onChange={(e) => setNewProjectDesc(e.target.value)}
                        placeholder="Project description..."
                        rows={2}
                        className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-2.5 text-sm text-slate-100 focus:outline-none focus:border-indigo-500 transition-colors resize-none"
                      />
                    </div>
                    <div>
                      <div className="flex justify-between items-center mb-2">
                        <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider">Classes & Prompts</label>
                        <button
                          type="button"
                          onClick={() => {
                            const colors = ["#34C759", "#007AFF", "#FF9500", "#FF3B30", "#AF52DE", "#5AC8FA"];
                            const nextColor = colors[newProjectClasses.length % colors.length];
                            setNewProjectClasses(prev => [...prev, { name: '', prompt: '', color: nextColor }]);
                          }}
                          className="bg-indigo-600 hover:bg-indigo-500 text-white font-bold py-1 px-3 rounded-lg text-xs transition-colors flex items-center gap-1"
                        >
                          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 4v16m8-8H4" />
                          </svg>
                          Add Class
                        </button>
                      </div>
                      
                      <div className="space-y-3.5 max-h-52 overflow-y-auto pr-1">
                        {newProjectClasses.map((cls, index) => (
                          <div key={index} className="flex gap-2.5 items-end bg-slate-950/40 p-2.5 rounded-xl border border-slate-855">
                            <div className="flex-shrink-0">
                              <label className="block text-[9px] font-bold text-slate-500 uppercase mb-1">Color</label>
                              <input 
                                type="color" 
                                value={cls.color}
                                onChange={(e) => {
                                  const updated = [...newProjectClasses];
                                  updated[index].color = e.target.value;
                                  setNewProjectClasses(updated);
                                }}
                                className="w-8 h-8 rounded-lg border border-slate-800 bg-transparent cursor-pointer p-0"
                              />
                            </div>
                            <div className="flex-1">
                              <label className="block text-[9px] font-bold text-slate-500 uppercase mb-1">Class Name</label>
                              <input 
                                type="text"
                                required
                                value={cls.name}
                                placeholder="e.g. cat"
                                onChange={(e) => {
                                  const updated = [...newProjectClasses];
                                  const oldName = updated[index].name;
                                  const newName = e.target.value;
                                  updated[index].name = newName;
                                  if (!updated[index].prompt || updated[index].prompt === `Locate ${oldName}.`) {
                                    updated[index].prompt = newName ? `Locate ${newName}.` : '';
                                  }
                                  setNewProjectClasses(updated);
                                }}
                                className="w-full bg-slate-900 border border-slate-800 rounded-lg px-3 py-1.5 text-xs text-slate-100 focus:outline-none focus:border-indigo-500"
                              />
                            </div>
                            <div className="flex-[2]">
                              <label className="block text-[9px] font-bold text-slate-500 uppercase mb-1">Locate Prompt</label>
                              <input 
                                type="text"
                                value={cls.prompt}
                                placeholder="e.g. Locate cat."
                                onChange={(e) => {
                                  const updated = [...newProjectClasses];
                                  updated[index].prompt = e.target.value;
                                  setNewProjectClasses(updated);
                                }}
                                className="w-full bg-slate-900 border border-slate-800 rounded-lg px-3 py-1.5 text-xs text-slate-100 focus:outline-none focus:border-indigo-500"
                              />
                            </div>
                            {newProjectClasses.length > 1 && (
                              <button
                                type="button"
                                onClick={() => {
                                  setNewProjectClasses(prev => prev.filter((_, idx) => idx !== index));
                                }}
                                className="bg-slate-800 hover:bg-red-950 text-slate-400 hover:text-red-400 p-2 rounded-lg border border-slate-750 hover:border-red-900 transition-colors"
                              >
                                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                </svg>
                              </button>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">Default AI Detection Prompt (Fallback)</label>
                      <input 
                        type="text" 
                        value={newProjectPrompt} 
                        onChange={(e) => setNewProjectPrompt(e.target.value)}
                        className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-2.5 text-sm text-slate-100 focus:outline-none focus:border-indigo-500 transition-colors"
                      />
                      <p className="text-[10px] text-slate-550 mt-1">
                        💡 <strong>Hint:</strong> If you don't enter class-specific prompts, the fallback default prompt is used.
                      </p>
                    </div>
                    <div className="flex gap-4 pt-4 mt-2">
                      <button
                        type="button"
                        onClick={() => setIsCreateModalOpen(false)}
                        className="flex-1 bg-slate-800 hover:bg-slate-700 text-slate-330 font-semibold py-2.5 rounded-xl text-sm transition-colors"
                      >
                        Cancel
                      </button>
                      <button
                        type="submit"
                        className="flex-1 bg-indigo-600 hover:bg-indigo-500 text-white font-semibold py-2.5 rounded-xl text-sm shadow-lg shadow-indigo-500/10 transition-colors"
                      >
                        Create
                      </button>
                    </div>
                  </form>
                </div>
              </div>
            )}
          </div>
        )}

        {view === 'project' && selectedProjectId && (
          <div className="flex-1 grid grid-cols-1 lg:grid-cols-4 gap-6 px-6 py-6 max-w-7xl mx-auto w-full">
            {/* Gallery Section */}
            <div className="lg:col-span-3 bg-slate-900/30 border border-slate-850 rounded-2xl p-6 flex flex-col">
              <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-6 border-b border-slate-800/80 pb-5">
                <div>
                  <h2 className="text-2xl font-bold">{projects.find(p => p.id === selectedProjectId)?.name || 'Project'}</h2>
                  <p className="text-slate-400 text-xs mt-1">Manage project images and trigger auto-annotations</p>
                </div>
                
                <div className="flex flex-wrap gap-3">
                  <div className="flex bg-slate-950 border border-slate-800 rounded-xl p-1 text-xs">
                    {['all', 'unlabeled', 'labeled'].map((filter) => (
                      <button
                        key={filter}
                        onClick={() => setStatusFilter(filter)}
                        className={`px-3 py-1.5 rounded-lg font-medium transition-all ${statusFilter === filter ? 'bg-slate-800 text-white shadow' : 'text-slate-400 hover:text-white'}`}
                      >
                        {filter.charAt(0).toUpperCase() + filter.slice(1)}
                      </button>
                    ))}
                  </div>

                  <div className="relative group">
                    <button className="bg-indigo-600 hover:bg-indigo-500 text-white font-semibold px-4 py-2 rounded-xl text-xs flex items-center gap-1.5 shadow-lg shadow-indigo-500/10 transition-all">
                      Export Data
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                      </svg>
                    </button>
                    <div className="absolute right-0 mt-2 w-40 bg-slate-900 border border-slate-800 rounded-xl shadow-xl overflow-hidden hidden group-hover:block z-20">
                      <button 
                        onClick={() => handleExport('yolo')}
                        className="w-full text-left px-4 py-2.5 text-xs font-semibold hover:bg-slate-800 text-slate-350 hover:text-white transition-colors"
                      >
                        YOLO Dataset (ZIP)
                      </button>
                      <button 
                        onClick={() => handleExport('coco')}
                        className="w-full text-left px-4 py-2.5 text-xs font-semibold hover:bg-slate-800 border-t border-slate-850 text-slate-350 hover:text-white transition-colors"
                      >
                        COCO JSON (ZIP)
                      </button>
                    </div>
                  </div>
                </div>
              </div>

              {/* Progress bar for background task */}
              {stats[selectedProjectId] && (isBatchLabeling || stats[selectedProjectId].batch_in_progress) && (
                <div className="bg-slate-900 border border-slate-800 p-4 rounded-xl mb-6 flex flex-col gap-2">
                  <div className="flex justify-between items-center text-xs">
                    <span className="font-semibold text-indigo-400 animate-pulse">Running Batch Auto-Labeling...</span>
                    <span className="font-mono text-slate-400">
                      {stats[selectedProjectId].labeled_images} / {stats[selectedProjectId].total_images} Labeled
                    </span>
                  </div>
                  <div className="w-full bg-slate-950 rounded-full h-1.5 overflow-hidden border border-slate-850">
                    <div 
                      className="bg-indigo-500 h-full rounded-full transition-all duration-500 animate-pulse"
                      style={{ 
                        width: `${Math.round((stats[selectedProjectId].labeled_images / stats[selectedProjectId].total_images) * 100)}%` 
                      }}
                    />
                  </div>
                </div>
              )}

              {/* Images Grid */}
              <div className="flex-1 min-h-[300px] overflow-y-auto mb-6">
                {images.length === 0 ? (
                  <div className="h-full flex flex-col items-center justify-center py-20 text-center">
                    <svg className="w-10 h-10 text-slate-600 mb-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                    </svg>
                    <p className="text-slate-400 font-medium text-sm">No images in this dataset yet</p>
                    <p className="text-slate-500 text-xs mt-1">Upload images using the control panel on the right</p>
                  </div>
                ) : (
                  <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
                    {images.map((img) => (
                      <div 
                        key={img.id}
                        onClick={() => { setCurrentImageId(img.id); setView('editor'); }}
                        className="bg-slate-950/80 border border-slate-855 rounded-xl overflow-hidden hover:border-slate-700 group cursor-pointer relative transition-all duration-200"
                      >
                        <div className="aspect-video w-full bg-slate-900 flex items-center justify-center overflow-hidden">
                          <img 
                            src={`${API_URL}/api/v1/images/${img.id}/file`} 
                            alt={img.filename} 
                            loading="lazy"
                            className="object-cover w-full h-full group-hover:scale-105 transition-transform duration-300"
                          />
                        </div>
                        <div className="p-3">
                          <p className="text-slate-350 text-xs font-semibold truncate">{img.filename}</p>
                          <div className="flex justify-between items-center mt-2">
                            <span className="text-[10px] font-mono text-slate-500">
                              {img.width ? `${img.width}x${img.height}` : 'loading'}
                            </span>
                            <span className={`text-[9px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full ${
                              img.status === 'labeled' ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' : 
                              img.status === 'in_progress' ? 'bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 animate-pulse' :
                              'bg-slate-800 text-slate-400 border border-slate-700'
                            }`}>
                              {img.status}
                            </span>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Sidebar Control Panel */}
            <div className="space-y-6">
              {/* Uploader Card */}
              <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-lg">
                <h3 className="text-xs font-bold text-indigo-400 uppercase tracking-wider mb-3">Upload Image Files</h3>
                <div className="border-2 border-dashed border-slate-800 hover:border-indigo-500/50 rounded-xl p-6 text-center cursor-pointer transition-all relative group bg-slate-950/40">
                  <input
                    type="file"
                    multiple
                    accept="image/*"
                    id="file-upload-input"
                    onChange={(e) => setUploadFiles(e.target.files)}
                    className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                  />
                  <svg className="w-8 h-8 mx-auto text-slate-500 mb-2 group-hover:text-indigo-400 transition-colors" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
                  </svg>
                  <p className="text-xs text-slate-350 font-semibold truncate">
                    {uploadFiles ? `${uploadFiles.length} files selected` : 'Drag files here or Browse'}
                  </p>
                </div>
                {uploadFiles && (
                  <button
                    onClick={handleUploadImages}
                    disabled={isUploading}
                    className="w-full bg-indigo-600 hover:bg-indigo-500 disabled:bg-slate-800 text-white text-xs font-bold py-2.5 rounded-xl mt-4 shadow-lg shadow-indigo-500/10 active:scale-95 transition-all duration-200"
                  >
                    {isUploading ? 'Uploading...' : 'Confirm Upload'}
                  </button>
                )}
              </div>

              {/* Class category Manager */}
              <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-lg">
                <h3 className="text-xs font-bold text-indigo-400 uppercase tracking-wider mb-3">Label Classes ({classes.length})</h3>
                <form onSubmit={handleAddClass} className="flex gap-2 mb-4">
                  <input 
                    type="text" 
                    required
                    value={newClassName}
                    onChange={(e) => setNewClassName(e.target.value)}
                    placeholder="New class name..."
                    className="flex-1 bg-slate-950 border border-slate-800 rounded-xl px-3 py-1.5 text-xs text-slate-100 focus:outline-none focus:border-indigo-500"
                  />
                  <input 
                    type="color"
                    value={newClassColor}
                    onChange={(e) => setNewClassColor(e.target.value)}
                    className="w-8 h-8 rounded-lg overflow-hidden border border-slate-800 bg-transparent cursor-pointer p-0"
                  />
                  <button
                    type="submit"
                    className="bg-slate-800 hover:bg-indigo-600 border border-slate-750 hover:border-transparent text-white p-2 rounded-xl transition-all"
                  >
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                    </svg>
                  </button>
                </form>

                <div className="max-h-72 overflow-y-auto space-y-2 pr-1">
                  {classes.length === 0 ? (
                    <p className="text-slate-500 text-xs italic">No custom classes registered yet.</p>
                  ) : (
                    classes.map((cls) => (
                      <div key={cls.id} className="bg-slate-950/60 border border-slate-850 p-2.5 rounded-xl space-y-1.5">
                        <div className="flex items-center gap-2">
                          <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: cls.color }} />
                          <span className="text-slate-300 font-mono font-bold truncate">{cls.name}</span>
                        </div>
                        <div>
                          <label className="block text-[8px] text-slate-500 uppercase tracking-wider mb-0.5">Locating Prompt</label>
                          <input
                            type="text"
                            value={cls.prompt || `Locate ${cls.name}.`}
                            onChange={(e) => {
                              const val = e.target.value;
                              setClasses(prev => prev.map(c => c.id === cls.id ? { ...c, prompt: val } : c));
                            }}
                            onBlur={(e) => handleUpdateClassPrompt(cls.id, e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') {
                                (e.target as HTMLInputElement).blur();
                              }
                            }}
                            className="w-full bg-slate-900 border border-slate-800 rounded-lg px-2 py-1 text-[11px] text-slate-200 focus:outline-none focus:border-indigo-500 transition-colors"
                          />
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>

              {/* Dataset wide actions */}
              <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-lg space-y-3">
                <h3 className="text-xs font-bold text-indigo-400 uppercase tracking-wider mb-1">AI Automation</h3>
                <p className="text-[11px] text-slate-400 leading-relaxed mb-2">Configure and run the Locate Anything model on the project dataset in the background.</p>
                <button
                  onClick={() => {
                    setBatchPrompt('');
                    setBatchTargetClasses(classes.map(c => c.name));
                    setIsBatchModalOpen(true);
                  }}
                  disabled={isBatchLabeling}
                  className="w-full bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-500 hover:to-indigo-500 disabled:from-slate-800 disabled:to-slate-800 text-white font-bold py-2.5 rounded-xl text-xs flex items-center justify-center gap-2 transition-all"
                >
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                  </svg>
                  Auto-Label All Images
                </button>
              </div>

            </div>
          </div>
        )}

        {view === 'editor' && currentImage && (
          <div className="flex-1 flex overflow-hidden h-[calc(100vh-69px)]">
            {/* Left sidebar: Thumbnails List */}
            <aside className="w-48 border-r border-slate-850 bg-slate-950/60 flex flex-col flex-shrink-0">
              <div className="p-4 border-b border-slate-850">
                <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400">Dataset Images</h3>
                <p className="text-[10px] text-slate-500 mt-0.5">{currentImageIndex + 1} of {images.length}</p>
              </div>
              <div className="flex-1 overflow-y-auto p-3 space-y-2">
                {images.map((img) => (
                  <div
                    key={img.id}
                    onClick={async () => {
                      const saved = await handleSaveAnnotations();
                      if (saved) setCurrentImageId(img.id);
                    }}
                    className={`p-1.5 rounded-lg border cursor-pointer hover:border-slate-700 transition-all ${
                      img.id === currentImageId 
                        ? 'border-indigo-500 bg-indigo-500/10' 
                        : 'border-slate-855 bg-slate-900/30'
                    }`}
                  >
                    <div className="aspect-video w-full rounded overflow-hidden bg-slate-950">
                      <img src={`${API_URL}/api/v1/images/${img.id}/file`} className="object-cover w-full h-full" alt="" />
                    </div>
                    <div className="flex items-center justify-between mt-1 px-1">
                      <span className="text-[10px] text-slate-400 font-semibold truncate w-24">{img.filename}</span>
                      <span className={`w-1.5 h-1.5 rounded-full ${img.status === 'labeled' ? 'bg-emerald-400' : 'bg-slate-500'}`} />
                    </div>
                  </div>
                ))}
              </div>
            </aside>

            {/* Center Canvas Area */}
            <section className="flex-1 bg-slate-950 flex flex-col items-center justify-center p-6 relative overflow-hidden">
              {/* Canvas toolbar */}
              <div className="absolute top-4 left-6 bg-slate-900/90 border border-slate-850 rounded-xl p-1.5 flex items-center gap-2 z-10 backdrop-blur shadow-2xl">
                <button
                  onClick={() => setCanvasMode('select')}
                  title="Select Mode"
                  className={`p-2 rounded-lg transition-all ${canvasMode === 'select' ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:text-white'}`}
                >
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 15l-2 5L9 9l11 4-5 2zm0 0l5 5M7.188 2.239l.777 2.897M5.136 7.965l-2.898-.777M13.95 4.05l-2.122 2.122m-5.657 5.656l-2.12 2.122" />
                  </svg>
                </button>
                <button
                  onClick={() => setCanvasMode('draw')}
                  title="Draw Bounding Box (Hotkey: D)"
                  className={`p-2 rounded-lg transition-all ${canvasMode === 'draw' ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:text-white'}`}
                >
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                  </svg>
                </button>
                <div className="h-4 w-[1px] bg-slate-850" />
                <span className="text-[10px] text-slate-450 px-2 font-mono">
                  {canvasMode === 'draw' ? 'DRAW BOX MODE' : 'SELECT / DRAG MODE'}
                </span>
              </div>

              {/* Navigation Indicators */}
              <div className="absolute left-6 inset-y-0 flex items-center pointer-events-none">
                <button 
                  onClick={handlePrevImage} 
                  disabled={currentImageIndex === 0}
                  className="bg-slate-900/80 border border-slate-850 hover:border-slate-750 hover:bg-slate-855 text-slate-300 w-10 h-10 rounded-full flex items-center justify-center pointer-events-auto hover:scale-105 active:scale-95 disabled:opacity-30 disabled:pointer-events-none transition-all shadow-xl"
                >
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                  </svg>
                </button>
              </div>

              <div className="absolute right-6 inset-y-0 flex items-center pointer-events-none">
                <button 
                  onClick={handleNextImage} 
                  disabled={currentImageIndex === images.length - 1}
                  className="bg-slate-900/80 border border-slate-850 hover:border-slate-750 hover:bg-slate-855 text-slate-300 w-10 h-10 rounded-full flex items-center justify-center pointer-events-auto hover:scale-105 active:scale-95 disabled:opacity-30 disabled:pointer-events-none transition-all shadow-xl"
                >
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                  </svg>
                </button>
              </div>

              {/* The Interactive Image Container */}
              <div 
                ref={imageContainerRef}
                onMouseDown={handleCanvasMouseDown}
                onMouseMove={handleCanvasMouseMove}
                onMouseUp={handleCanvasMouseUp}
                className="max-h-[85%] max-w-[85%] relative border border-slate-800 shadow-2xl select-none"
              >
                <img
                  ref={imageRef}
                  src={`${API_URL}/api/v1/images/${currentImageId}/file`}
                  alt=""
                  onLoad={updateRenderedDimensions}
                  className="max-h-full max-w-full block pointer-events-none"
                />

                {/* DOM HTML bounding boxes overlays layer */}
                {renderedWidth > 0 && renderedHeight > 0 && currentImage && (
                  <div className="absolute inset-0 w-full h-full pointer-events-auto z-20 overflow-hidden">
                    {annotations.map((ann) => {
                      const origW = currentImage.width || 1;
                      const origH = currentImage.height || 1;

                      const left = (ann.x1 / origW) * renderedWidth;
                      const top = (ann.y1 / origH) * renderedHeight;
                      const width = ((ann.x2 - ann.x1) / origW) * renderedWidth;
                      const height = ((ann.y2 - ann.y1) / origH) * renderedHeight;
                      
                      const isSelected = ann.id === selectedAnnId;
                      const boxColor = ann.color || '#34C759';

                      return (
                        <div
                          key={ann.id}
                          style={{
                            left: `${left}px`,
                            top: `${top}px`,
                            width: `${width}px`,
                            height: `${height}px`,
                            borderColor: boxColor,
                          }}
                          className={`absolute border-2 transition-shadow cursor-move ${
                            isSelected ? 'ring-2 ring-white/50 shadow-2xl' : 'hover:bg-white/5'
                          }`}
                        >
                          {/* Label tag display on box */}
                          <div 
                            style={{ backgroundColor: boxColor }}
                            className="absolute -top-6 left-[-2px] text-[10px] text-white px-2 py-0.5 rounded font-mono font-bold whitespace-nowrap shadow select-none"
                          >
                            {ann.label}
                          </div>

                          {/* Resize handle (bottom right) */}
                          {isSelected && (
                            <div
                              onMouseDown={(e) => {
                                e.stopPropagation();
                                setIsDragging(true);
                                setDraggedAnnId(ann.id);
                                setDragStart(getCanvasMouseCoords(e));
                                setDragInitialBox({ x1: ann.x1, y1: ann.y1, x2: ann.x2, y2: ann.y2 });
                                setDragMode('se');
                              }}
                              className="absolute bottom-[-5px] right-[-5px] w-3 h-3 bg-white border border-slate-900 rounded-sm cursor-se-resize shadow"
                            />
                          )}
                        </div>
                      );
                    })}

                    {/* Temporary box being drawn */}
                    {isDrawing && (
                      <div
                        style={{
                          left: `${Math.min(drawStart.x, drawEnd.x)}px`,
                          top: `${Math.min(drawStart.y, drawEnd.y)}px`,
                          width: `${Math.abs(drawEnd.x - drawStart.x)}px`,
                          height: `${Math.abs(drawEnd.y - drawStart.y)}px`,
                        }}
                        className="absolute border-2 border-dashed border-indigo-400 bg-indigo-500/10 pointer-events-none"
                      />
                    )}
                  </div>
                )}
              </div>
            </section>

            {/* Right sidebar: Inspector & AI models control panel */}
            <aside className="w-80 border-l border-slate-850 bg-slate-900/40 backdrop-blur-md flex flex-col flex-shrink-0">
              {/* AI Auto label panel */}
              <div className="p-5 border-b border-slate-850 space-y-4">
                <h3 className="text-xs font-bold uppercase tracking-wider text-indigo-400 mb-1">AI Smart Auto-Labeler</h3>
                
                <div>
                  <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Target Prompt</label>
                  <input
                    type="text"
                    value={editorPrompt}
                    onChange={(e) => setEditorPrompt(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-1.5 text-xs text-slate-100 focus:outline-none focus:border-indigo-500 mb-2.5"
                  />
                  <div className="flex gap-2.5">
                    <div className="flex-1">
                      <label className="block text-[9px] font-bold text-slate-400 uppercase tracking-wider mb-1">Mode</label>
                      <select
                        value={editorLabelMode}
                        onChange={(e) => setEditorLabelMode(e.target.value as 'overwrite' | 'merge')}
                        className="w-full bg-slate-950 border border-slate-800 rounded-lg px-2 py-1.5 text-[11px] text-slate-100 focus:outline-none focus:border-indigo-500"
                      >
                        <option value="overwrite">Overwrite</option>
                        <option value="merge">Merge</option>
                      </select>
                    </div>
                    <div className="flex-1">
                      <label className="block text-[9px] font-bold text-slate-400 uppercase tracking-wider mb-1">Target Class</label>
                      <select
                        value={editorTargetClassOption}
                        onChange={(e) => setEditorTargetClassOption(e.target.value as 'all' | 'active')}
                        className="w-full bg-slate-950 border border-slate-800 rounded-lg px-2 py-1.5 text-[11px] text-slate-100 focus:outline-none focus:border-indigo-500"
                      >
                        <option value="all">All Classes</option>
                        <option value="active">Active ({activeClass})</option>
                      </select>
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5 pt-1.5">
                    <input
                      type="checkbox"
                      id="editor-filter-classes"
                      checked={editorFilterByClasses}
                      onChange={(e) => setEditorFilterByClasses(e.target.checked)}
                      className="rounded border-slate-800 bg-slate-950 text-indigo-600 focus:ring-0 w-3.5 h-3.5 cursor-pointer"
                    />
                    <label htmlFor="editor-filter-classes" className="text-[10px] font-semibold text-slate-400 cursor-pointer select-none">
                      Filter Detections by Project Classes
                    </label>
                  </div>
                </div>

                <button
                  onClick={handleAutoLabelCurrent}
                  disabled={isAiRunning}
                  className="w-full bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-500 hover:to-indigo-500 disabled:from-slate-800 disabled:to-slate-800 text-white font-bold py-2.5 rounded-lg text-xs flex items-center justify-center gap-1.5 shadow-lg shadow-indigo-500/10 active:scale-95 transition-all"
                >
                  {isAiRunning ? (
                    <>
                      <svg className="animate-spin h-4 w-4 text-white" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                      </svg>
                      Running model...
                    </>
                  ) : (
                    <>
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                      </svg>
                      Run Model Annotation
                    </>
                  )}
                </button>
              </div>

              {/* Active Draw Class Selection */}
              <div className="p-5 border-b border-slate-850 space-y-3">
                <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400">Active Drawing Class</h3>
                <div className="flex flex-wrap gap-2">
                  {classes.map((cls) => {
                    const isActive = activeClass === cls.name;
                    return (
                      <button
                        key={cls.id}
                        onClick={() => setActiveClass(cls.name)}
                        className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-all border ${
                          isActive
                            ? 'bg-indigo-600/20 border-indigo-500 text-indigo-200'
                            : 'bg-slate-950 border-slate-800 text-slate-400 hover:border-slate-700 hover:text-slate-300'
                        }`}
                      >
                        <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: cls.color }} />
                        {cls.name}
                      </button>
                    );
                  })}
                  {classes.length === 0 && (
                    <p className="text-slate-500 text-xs italic">No project classes defined.</p>
                  )}
                </div>
              </div>

              {/* Bounding box list */}
              <div className="flex-1 flex flex-col min-h-0">
                <div className="p-4 border-b border-slate-850">
                  <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400">Annotations ({annotations.length})</h3>
                </div>

                <div className="flex-1 overflow-y-auto p-4 space-y-2.5">
                  {annotations.length === 0 ? (
                    <p className="text-slate-500 text-xs italic text-center py-6">No annotations created yet.</p>
                  ) : (
                    annotations.map((ann) => {
                      const isSelected = ann.id === selectedAnnId;
                      return (
                        <div
                          key={ann.id}
                          onClick={() => setSelectedAnnId(ann.id)}
                          className={`p-3 rounded-xl border flex flex-col justify-between cursor-pointer transition-all ${
                            isSelected 
                              ? 'border-indigo-500 bg-indigo-500/10' 
                              : 'border-slate-855 bg-slate-955/20 hover:border-slate-800'
                          }`}
                        >
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-1.5">
                              <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: ann.color }} />
                              
                              {isSelected ? (
                                <select
                                  value={ann.label || ''}
                                  onChange={(e) => handleChangeSelectedClass(e.target.value)}
                                  onClick={(e) => e.stopPropagation()}
                                  className="bg-slate-950 border border-slate-800 rounded-md px-1.5 py-0.5 text-xs text-slate-100 font-mono focus:outline-none focus:border-indigo-500"
                                >
                                  {classes.map(c => (
                                    <option key={c.id} value={c.name}>{c.name}</option>
                                  ))}
                                  {!classes.some(c => c.name === ann.label) && ann.label && (
                                    <option value={ann.label}>{ann.label}</option>
                                  )}
                                </select>
                              ) : (
                                <span className="font-mono text-xs font-semibold text-slate-200 truncate max-w-[120px]">{ann.label}</span>
                              )}
                            </div>
                            <button
                              onClick={(e) => { e.stopPropagation(); handleDeleteAnnotation(ann.id); }}
                              className="text-slate-500 hover:text-red-400 p-1 rounded transition-colors"
                            >
                              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                              </svg>
                            </button>
                          </div>
                          
                          <div className="flex items-center justify-between mt-2.5 text-[10px] text-slate-550 font-mono">
                            <span>[{Math.round(ann.x1)}, {Math.round(ann.y1)}, {Math.round(ann.x2)}, {Math.round(ann.y2)}]</span>
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>

              {/* Bottom save bar */}
              <div className="p-4 border-t border-slate-850 bg-slate-950/80">
                <button
                  onClick={async () => {
                    const saved = await handleSaveAnnotations();
                    if (saved) setView('project');
                  }}
                  className="w-full bg-slate-850 hover:bg-slate-800 border border-slate-750 text-slate-200 font-bold py-2.5 rounded-xl text-xs transition-all mb-2"
                >
                  Save & Exit
                </button>
                
                {currentImageIndex < images.length - 1 ? (
                  <button
                    onClick={handleNextImage}
                    className="w-full bg-indigo-600 hover:bg-indigo-500 text-white font-bold py-2.5 rounded-xl text-xs shadow-lg shadow-indigo-500/10 active:scale-95 transition-all"
                  >
                    Save & Next (Enter)
                  </button>
                ) : (
                  <button
                    onClick={async () => {
                      const saved = await handleSaveAnnotations();
                      if (saved) setView('project');
                    }}
                    className="w-full bg-indigo-600 hover:bg-indigo-500 text-white font-bold py-2.5 rounded-xl text-xs shadow-lg shadow-indigo-500/10 active:scale-95 transition-all"
                  >
                    Save & Finish
                  </button>
                )}
              </div>
            </aside>
          </div>
        )}
        {/* Batch Auto-Label Settings Modal */}
        {isBatchModalOpen && (
          <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center z-50 p-4 animate-fadeIn">
            <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-lg shadow-2xl p-6 relative">
              <button
                onClick={() => setIsBatchModalOpen(false)}
                className="absolute top-4 right-4 text-slate-400 hover:text-white"
              >
                <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
              <h3 className="text-xl font-bold mb-4">Batch Auto-Label Dataset</h3>
              
              <div className="space-y-4">
                {/* Prompt input */}
                <div>
                  <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">AI Detection Prompt (Optional Override)</label>
                  <input 
                    type="text" 
                    value={batchPrompt} 
                    onChange={(e) => setBatchPrompt(e.target.value)}
                    placeholder="Leave empty to use class-specific prompts (recommended)"
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-2.5 text-sm text-slate-100 focus:outline-none focus:border-indigo-500 transition-colors"
                  />
                  <p className="text-[10px] text-slate-500 mt-1">
                    💡 <strong>Default behavior:</strong> Left blank, the model runs sequentially class-by-class, using each class's own prompt. Or enter a prompt override to query all classes in one go.
                  </p>
                </div>

                {/* Target Classes */}
                <div className="bg-slate-950/40 border border-slate-850 p-4 rounded-xl space-y-2">
                  <div className="flex justify-between items-center">
                    <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider">Target Classes</label>
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          const all = classes.map(c => c.name);
                          setBatchTargetClasses(all);
                        }}
                        className="text-[10px] text-indigo-400 hover:text-indigo-300 font-semibold"
                      >
                        Select All
                      </button>
                      <span className="text-[10px] text-slate-650">|</span>
                      <button
                        type="button"
                        onClick={() => {
                          setBatchTargetClasses([]);
                        }}
                        className="text-[10px] text-indigo-400 hover:text-indigo-300 font-semibold"
                      >
                        Clear All
                      </button>
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-2 pt-1">
                    {classes.map((cls) => {
                      const isChecked = batchTargetClasses.includes(cls.name);
                      return (
                        <button
                          key={cls.id}
                          type="button"
                          onClick={() => handleToggleBatchClass(cls.name)}
                          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl border text-xs font-medium transition-all ${
                            isChecked
                              ? 'bg-indigo-600/20 border-indigo-500/80 text-indigo-200 shadow-sm'
                              : 'bg-slate-950/60 border-slate-850 text-slate-450 hover:border-slate-800'
                          }`}
                        >
                          <span className="w-2 h-2 rounded-full" style={{ backgroundColor: cls.color }} />
                          {cls.name}
                        </button>
                      );
                    })}
                  </div>
                  <p className="text-[10px] text-slate-550">
                    💡 Selected classes will be auto-labeled using their respective specific prompts.
                  </p>
                </div>

                {/* Target Images */}
                <div>
                  <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">Target Images</label>
                  <div className="grid grid-cols-2 gap-3">
                    <button
                      type="button"
                      onClick={() => setBatchTargetImages('unlabeled')}
                      className={`px-4 py-2 rounded-xl border text-xs font-semibold transition-all ${
                        batchTargetImages === 'unlabeled'
                          ? 'bg-indigo-600/20 border-indigo-500 text-indigo-200'
                          : 'bg-slate-950 border-slate-850 text-slate-450 hover:border-slate-800'
                      }`}
                    >
                      Unlabeled images only
                    </button>
                    <button
                      type="button"
                      onClick={() => setBatchTargetImages('all')}
                      className={`px-4 py-2 rounded-xl border text-xs font-semibold transition-all ${
                        batchTargetImages === 'all'
                          ? 'bg-indigo-600/20 border-indigo-500 text-indigo-200'
                          : 'bg-slate-950 border-slate-850 text-slate-400 hover:border-slate-800'
                      }`}
                    >
                      All images in dataset
                    </button>
                  </div>
                </div>

                {/* Mode (Merge vs Overwrite) */}
                <div>
                  <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">Labeling Mode</label>
                  <div className="grid grid-cols-2 gap-3">
                    <button
                      type="button"
                      onClick={() => setBatchMode('overwrite')}
                      className={`px-4 py-2 rounded-xl border text-xs font-semibold transition-all ${
                        batchMode === 'overwrite'
                          ? 'bg-indigo-600/20 border-indigo-500 text-indigo-200'
                          : 'bg-slate-950 border-slate-850 text-slate-400 hover:border-slate-800'
                      }`}
                    >
                      Overwrite existing
                    </button>
                    <button
                      type="button"
                      onClick={() => setBatchMode('merge')}
                      className={`px-4 py-2 rounded-xl border text-xs font-semibold transition-all ${
                        batchMode === 'merge'
                          ? 'bg-indigo-600/20 border-indigo-500 text-indigo-200'
                          : 'bg-slate-950 border-slate-850 text-slate-400 hover:border-slate-800'
                      }`}
                    >
                      Merge / Incremental
                    </button>
                  </div>
                  <p className="text-[10px] text-slate-550 mt-1">
                    {batchMode === 'overwrite'
                      ? 'Overwrite deletes existing boxes of the selected target classes. Other classes remain intact.'
                      : 'Merge appends new predictions without deleting any existing boxes.'}
                  </p>
                </div>

                {/* Filter by project classes */}
                <div className="flex items-center gap-3 bg-slate-950/60 border border-slate-850/60 p-3 rounded-xl">
                  <input
                    type="checkbox"
                    id="batch-filter-classes"
                    checked={batchFilterByClasses}
                    onChange={(e) => setBatchFilterByClasses(e.target.checked)}
                    className="rounded border-slate-800 bg-slate-950 text-indigo-600 focus:ring-0 w-4 h-4 cursor-pointer"
                  />
                  <label htmlFor="batch-filter-classes" className="text-xs font-medium text-slate-350 cursor-pointer select-none">
                    Filter detections by project classes
                  </label>
                </div>

                <div className="flex gap-4 pt-4 mt-2">
                  <button
                    type="button"
                    onClick={() => setIsBatchModalOpen(false)}
                    className="flex-1 bg-slate-800 hover:bg-slate-700 text-slate-330 font-semibold py-2.5 rounded-xl text-sm transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      handleBatchLabel(batchPrompt, batchTargetImages, batchMode, batchFilterByClasses, batchTargetClasses);
                      setIsBatchModalOpen(false);
                    }}
                    className="flex-1 bg-indigo-600 hover:bg-indigo-500 text-white font-semibold py-2.5 rounded-xl text-sm shadow-lg shadow-indigo-500/10 transition-colors"
                  >
                    Run Auto-Labeling
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
