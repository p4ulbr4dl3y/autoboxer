import { useState, useEffect, useRef, useCallback } from 'react';
import { api } from '../api/client';
import type { Annotation, ClassCategory, ImageItem, Project } from '../types';

interface EditorProps {
  currentImageId: number;
  images: ImageItem[];
  classes: ClassCategory[];
  project: Project | undefined;
  onSaveAndExit: () => void;
  onImageChange: (imageId: number) => void;
  setImages: React.Dispatch<React.SetStateAction<ImageItem[]>>;
}

export default function Editor({
  currentImageId, images, classes, project, onSaveAndExit, onImageChange, setImages,
}: EditorProps) {
  const currentImage = images.find(img => img.id === currentImageId);
  const currentImageIndex = images.findIndex(img => img.id === currentImageId);

  // Editor state
  const [annotations, setAnnotations] = useState<Annotation[]>([]);
  const [selectedAnnId, setSelectedAnnId] = useState<number | string | null>(null);
  const [canvasMode, setCanvasMode] = useState<'select' | 'draw'>('select');
  const [activeClass, setActiveClass] = useState<string>('');

  // AI settings
  const [editorPrompt, setEditorPrompt] = useState(project?.default_prompt || 'Locate objects.');
  const [editorLabelMode, setEditorLabelMode] = useState<'overwrite' | 'merge'>('overwrite');
  const [editorFilterByClasses, setEditorFilterByClasses] = useState(true);
  const [editorTargetClassOption, setEditorTargetClassOption] = useState<'all' | 'active'>('all');
  const [isAiRunning, setIsAiRunning] = useState(false);

  // Canvas sizing
  const [renderedWidth, setRenderedWidth] = useState(0);
  const [renderedHeight, setRenderedHeight] = useState(0);
  const imageContainerRef = useRef<HTMLDivElement>(null);
  const imageRef = useRef<HTMLImageElement>(null);

  // Drawing state
  const [isDrawing, setIsDrawing] = useState(false);
  const [drawStart, setDrawStart] = useState({ x: 0, y: 0 });
  const [drawEnd, setDrawEnd] = useState({ x: 0, y: 0 });

  // Dragging state
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const [draggedAnnId, setDraggedAnnId] = useState<number | string | null>(null);
  const [dragMode, setDragMode] = useState<'move' | 'se'>('move');
  const [dragInitialBox, setDragInitialBox] = useState({ x1: 0, y1: 0, x2: 0, y2: 0 });

  // Set initial active class
  useEffect(() => {
    if (classes.length > 0 && !activeClass) {
      setActiveClass(classes[0].name);
    }
  }, [classes, activeClass]);

  // Sync editor prompt with class selection
  useEffect(() => {
    if (editorTargetClassOption === 'active' && activeClass) {
      setEditorPrompt(`Locate ${activeClass.toLowerCase()}.`);
    } else if (editorTargetClassOption === 'all') {
      const classNames = classes.map(c => c.name.toLowerCase());
      if (classNames.length > 0) {
        setEditorPrompt(`Locate ${classNames.join(' and ')}.`);
      }
    }
  }, [editorTargetClassOption, activeClass, classes]);

  // Fetch annotations
  const fetchAnnotations = useCallback(async (imageId: number) => {
    try {
      const data = await api.annotations.get(imageId);
      const mapped = data.map((ann: Annotation) => {
        const cls = classes.find(c => c.name === ann.label);
        return { ...ann, color: cls ? cls.color : '#34C759' };
      });
      setAnnotations(mapped);
      setSelectedAnnId(mapped.length > 0 ? mapped[0].id : null);
    } catch (e) {
      console.error(e);
    }
  }, [classes]);

  useEffect(() => {
    fetchAnnotations(currentImageId);
  }, [currentImageId, fetchAnnotations]);

  // Save annotations
  const handleSaveAnnotations = useCallback(async () => {
    try {
      const cleaned = annotations.map((ann, index) => ({
        box_id: index + 1,
        x1: Math.round(ann.x1),
        y1: Math.round(ann.y1),
        x2: Math.round(ann.x2),
        y2: Math.round(ann.y2),
        label: ann.label,
      }));
      await api.annotations.update(currentImageId, cleaned);
      setImages(prev => prev.map(img => img.id === currentImageId ? { ...img, status: 'labeled' } : img));
      return true;
    } catch (e) {
      console.error(e);
      return false;
    }
  }, [annotations, currentImageId, setImages]);

  // Auto-label current image
  const handleAutoLabelCurrent = async () => {
    setIsAiRunning(true);
    try {
      const params = new URLSearchParams();
      if (editorPrompt) params.append('prompt', editorPrompt);
      params.append('mode', editorLabelMode);
      params.append('filter_by_classes', editorFilterByClasses.toString());
      if (editorTargetClassOption === 'active' && activeClass) {
        params.append('target_classes', activeClass);
      }
      const data = await api.images.autoLabel(currentImageId, params);
      const mapped = data.map((ann: Annotation) => {
        const cls = classes.find(c => c.name === ann.label);
        return { ...ann, color: cls ? cls.color : '#34C759' };
      });
      setAnnotations(mapped);
      if (mapped.length > 0) setSelectedAnnId(mapped[0].id);
      setImages(prev => prev.map(img => img.id === currentImageId ? { ...img, status: 'labeled' } : img));
    } catch (e) {
      console.error(e);
    } finally {
      setIsAiRunning(false);
    }
  };

  // Navigation
  const handleNextImage = async () => {
    const saved = await handleSaveAnnotations();
    if (saved && currentImageIndex < images.length - 1) {
      onImageChange(images[currentImageIndex + 1].id);
    }
  };

  const handlePrevImage = async () => {
    const saved = await handleSaveAnnotations();
    if (saved && currentImageIndex > 0) {
      onImageChange(images[currentImageIndex - 1].id);
    }
  };

  // Canvas sizing
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

  // Canvas helpers
  const getCanvasMouseCoords = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!imageContainerRef.current) return { x: 0, y: 0 };
    const rect = imageContainerRef.current.getBoundingClientRect();
    return {
      x: Math.max(0, Math.min(renderedWidth, e.clientX - rect.left)),
      y: Math.max(0, Math.min(renderedHeight, e.clientY - rect.top)),
    };
  };

  const findAnnotationAtCoords = (x: number, y: number): Annotation | null => {
    if (!currentImage) return null;
    const origW = currentImage.width || 1;
    const origH = currentImage.height || 1;
    const origX = (x / renderedWidth) * origW;
    const origY = (y / renderedHeight) * origH;
    for (let i = annotations.length - 1; i >= 0; i--) {
      const ann = annotations[i];
      if (origX >= ann.x1 && origX <= ann.x2 && origY >= ann.y1 && origY <= ann.y2) return ann;
    }
    return null;
  };

  // Canvas mouse handlers
  const handleCanvasMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
    const coords = getCanvasMouseCoords(e);
    if (canvasMode === 'draw') {
      setIsDrawing(true);
      setDrawStart(coords);
      setDrawEnd(coords);
    } else {
      const clickedAnn = findAnnotationAtCoords(coords.x, coords.y);
      if (clickedAnn) {
        setSelectedAnnId(clickedAnn.id);
        setIsDragging(true);
        setDraggedAnnId(clickedAnn.id);
        setDragStart(coords);
        setDragInitialBox({ x1: clickedAnn.x1, y1: clickedAnn.y1, x2: clickedAnn.x2, y2: clickedAnn.y2 });
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

      setAnnotations(prev => prev.map(ann => {
        if (ann.id !== draggedAnnId) return ann;
        let { x1: newX1, y1: newY1, x2: newX2, y2: newY2 } = dragInitialBox;
        if (dragMode === 'move') {
          newX1 += deltaOrigX; newX2 += deltaOrigX;
          newY1 += deltaOrigY; newY2 += deltaOrigY;
          if (newX1 < 0) { newX2 -= newX1; newX1 = 0; }
          if (newX2 > origW) { newX1 -= (newX2 - origW); newX2 = origW; }
          if (newY1 < 0) { newY2 -= newY1; newY1 = 0; }
          if (newY2 > origH) { newY1 -= (newY2 - origH); newY2 = origH; }
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
      }));
    }
  };

  const handleCanvasMouseUp = () => {
    if (isDrawing && currentImage) {
      setIsDrawing(false);
      const origW = currentImage.width || 1;
      const origH = currentImage.height || 1;
      const origX1 = (Math.min(drawStart.x, drawEnd.x) / renderedWidth) * origW;
      const origY1 = (Math.min(drawStart.y, drawEnd.y) / renderedHeight) * origH;
      const origX2 = (Math.max(drawStart.x, drawEnd.x) / renderedWidth) * origW;
      const origY2 = (Math.max(drawStart.y, drawEnd.y) / renderedHeight) * origH;

      if (origX2 - origX1 > 10 && origY2 - origY1 > 10) {
        const cls = classes.find(c => c.name === activeClass);
        const tempId = `temp_${Date.now()}`;
        setAnnotations(prev => [...prev, {
          id: tempId, image_id: currentImage.id, box_id: prev.length + 1,
          x1: Math.round(origX1), y1: Math.round(origY1), x2: Math.round(origX2), y2: Math.round(origY2),
          label: activeClass || 'object', color: cls ? cls.color : '#34C759',
        }]);
        setSelectedAnnId(tempId);
      }
      setCanvasMode('select');
    }
    setIsDragging(false);
    setDraggedAnnId(null);
  };

  const handleDeleteAnnotation = (id: number | string) => {
    setAnnotations(prev => prev.filter(ann => ann.id !== id));
    if (selectedAnnId === id) setSelectedAnnId(null);
  };

  const handleChangeSelectedClass = (className: string) => {
    if (selectedAnnId === null) return;
    const cls = classes.find(c => c.name === className);
    setAnnotations(prev => prev.map(ann =>
      ann.id === selectedAnnId ? { ...ann, label: className, color: cls ? cls.color : '#34C759' } : ann
    ));
  };

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if (e.key === 'Delete' || e.key === 'Backspace') {
        if (selectedAnnId !== null) handleDeleteAnnotation(selectedAnnId);
      } else if (e.key === 'ArrowRight') {
        handleNextImage();
      } else if (e.key === 'ArrowLeft') {
        handlePrevImage();
      } else if (e.key === 'Enter') {
        if (currentImageIndex < images.length - 1) handleNextImage();
        else handleSaveAnnotations().then(saved => { if (saved) onSaveAndExit(); });
      } else if (e.key === 'd' || e.key === 'в') {
        setCanvasMode('draw');
      } else if (e.key === 's' || e.key === 'ы') {
        setCanvasMode('select');
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectedAnnId, annotations, currentImageId, currentImageIndex, images]);

  if (!currentImage) return null;

  return (
    <div className="flex-1 flex overflow-hidden h-[calc(100vh-69px)]">
      {/* Left sidebar: Thumbnails */}
      <aside className="w-48 border-r border-slate-850 bg-slate-950/60 flex flex-col flex-shrink-0">
        <div className="p-4 border-b border-slate-850">
          <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400">Dataset Images</h3>
          <p className="text-[10px] text-slate-500 mt-0.5">{currentImageIndex + 1} of {images.length}</p>
        </div>
        <div className="flex-1 overflow-y-auto p-3 space-y-2">
          {images.map(img => (
            <div key={img.id}
              onClick={async () => { const saved = await handleSaveAnnotations(); if (saved) onImageChange(img.id); }}
              className={`p-1.5 rounded-lg border cursor-pointer hover:border-slate-700 transition-all ${
                img.id === currentImageId ? 'border-indigo-500 bg-indigo-500/10' : 'border-slate-855 bg-slate-900/30'
              }`}>
              <div className="aspect-video w-full rounded overflow-hidden bg-slate-950">
                <img src={api.images.fileUrl(img.id)} className="object-cover w-full h-full" alt="" />
              </div>
              <div className="flex items-center justify-between mt-1 px-1">
                <span className="text-[10px] text-slate-400 font-semibold truncate w-24">{img.filename}</span>
                <span className={`w-1.5 h-1.5 rounded-full ${img.status === 'labeled' ? 'bg-emerald-400' : 'bg-slate-500'}`} />
              </div>
            </div>
          ))}
        </div>
      </aside>

      {/* Center Canvas */}
      <section className="flex-1 bg-slate-950 flex flex-col items-center justify-center p-6 relative overflow-hidden">
        {/* Toolbar */}
        <div className="absolute top-4 left-6 bg-slate-900/90 border border-slate-850 rounded-xl p-1.5 flex items-center gap-2 z-10 backdrop-blur shadow-2xl">
          <button onClick={() => setCanvasMode('select')} title="Select Mode"
            className={`p-2 rounded-lg transition-all ${canvasMode === 'select' ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:text-white'}`}>
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 15l-2 5L9 9l11 4-5 2zm0 0l5 5M7.188 2.239l.777 2.897M5.136 7.965l-2.898-.777M13.95 4.05l-2.122 2.122m-5.657 5.656l-2.12 2.122" />
            </svg>
          </button>
          <button onClick={() => setCanvasMode('draw')} title="Draw Bounding Box (Hotkey: D)"
            className={`p-2 rounded-lg transition-all ${canvasMode === 'draw' ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:text-white'}`}>
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
          </button>
          <div className="h-4 w-[1px] bg-slate-850" />
          <span className="text-[10px] text-slate-450 px-2 font-mono">
            {canvasMode === 'draw' ? 'DRAW BOX MODE' : 'SELECT / DRAG MODE'}
          </span>
        </div>

        {/* Navigation arrows */}
        <div className="absolute left-6 inset-y-0 flex items-center pointer-events-none">
          <button onClick={handlePrevImage} disabled={currentImageIndex === 0}
            className="bg-slate-900/80 border border-slate-850 hover:border-slate-750 hover:bg-slate-855 text-slate-300 w-10 h-10 rounded-full flex items-center justify-center pointer-events-auto hover:scale-105 active:scale-95 disabled:opacity-30 disabled:pointer-events-none transition-all shadow-xl">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          </button>
        </div>
        <div className="absolute right-6 inset-y-0 flex items-center pointer-events-none">
          <button onClick={handleNextImage} disabled={currentImageIndex === images.length - 1}
            className="bg-slate-900/80 border border-slate-850 hover:border-slate-750 hover:bg-slate-855 text-slate-300 w-10 h-10 rounded-full flex items-center justify-center pointer-events-auto hover:scale-105 active:scale-95 disabled:opacity-30 disabled:pointer-events-none transition-all shadow-xl">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
          </button>
        </div>

        {/* Image container with bounding box overlays */}
        <div ref={imageContainerRef}
          onMouseDown={handleCanvasMouseDown} onMouseMove={handleCanvasMouseMove} onMouseUp={handleCanvasMouseUp}
          className="max-h-[85%] max-w-[85%] relative border border-slate-800 shadow-2xl select-none">
          <img ref={imageRef} src={api.images.fileUrl(currentImageId)} alt=""
            onLoad={updateRenderedDimensions}
            className="max-h-full max-w-full block pointer-events-none" />

          {renderedWidth > 0 && renderedHeight > 0 && (
            <div className="absolute inset-0 w-full h-full pointer-events-auto z-20 overflow-hidden">
              {annotations.map(ann => {
                const origW = currentImage.width || 1;
                const origH = currentImage.height || 1;
                const left = (ann.x1 / origW) * renderedWidth;
                const top = (ann.y1 / origH) * renderedHeight;
                const width = ((ann.x2 - ann.x1) / origW) * renderedWidth;
                const height = ((ann.y2 - ann.y1) / origH) * renderedHeight;
                const isSelected = ann.id === selectedAnnId;
                const boxColor = ann.color || '#34C759';

                return (
                  <div key={ann.id}
                    style={{ left: `${left}px`, top: `${top}px`, width: `${width}px`, height: `${height}px`, borderColor: boxColor }}
                    className={`absolute border-2 transition-shadow cursor-move ${isSelected ? 'ring-2 ring-white/50 shadow-2xl' : 'hover:bg-white/5'}`}>
                    <div style={{ backgroundColor: boxColor }}
                      className="absolute -top-6 left-[-2px] text-[10px] text-white px-2 py-0.5 rounded font-mono font-bold whitespace-nowrap shadow select-none">
                      {ann.label}
                    </div>
                    {isSelected && (
                      <div
                        onMouseDown={e => {
                          e.stopPropagation();
                          setIsDragging(true);
                          setDraggedAnnId(ann.id);
                          setDragStart(getCanvasMouseCoords(e));
                          setDragInitialBox({ x1: ann.x1, y1: ann.y1, x2: ann.x2, y2: ann.y2 });
                          setDragMode('se');
                        }}
                        className="absolute bottom-[-5px] right-[-5px] w-3 h-3 bg-white border border-slate-900 rounded-sm cursor-se-resize shadow" />
                    )}
                  </div>
                );
              })}

              {isDrawing && (
                <div style={{
                  left: `${Math.min(drawStart.x, drawEnd.x)}px`,
                  top: `${Math.min(drawStart.y, drawEnd.y)}px`,
                  width: `${Math.abs(drawEnd.x - drawStart.x)}px`,
                  height: `${Math.abs(drawEnd.y - drawStart.y)}px`,
                }} className="absolute border-2 border-dashed border-indigo-400 bg-indigo-500/10 pointer-events-none" />
              )}
            </div>
          )}
        </div>
      </section>

      {/* Right sidebar */}
      <aside className="w-80 border-l border-slate-850 bg-slate-900/40 backdrop-blur-md flex flex-col flex-shrink-0">
        {/* AI panel */}
        <div className="p-5 border-b border-slate-850 space-y-4">
          <h3 className="text-xs font-bold uppercase tracking-wider text-indigo-400 mb-1">AI Smart Auto-Labeler</h3>
          <div>
            <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Target Prompt</label>
            <input type="text" value={editorPrompt} onChange={e => setEditorPrompt(e.target.value)}
              className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-1.5 text-xs text-slate-100 focus:outline-none focus:border-indigo-500 mb-2.5" />
            <div className="flex gap-2.5">
              <div className="flex-1">
                <label className="block text-[9px] font-bold text-slate-400 uppercase tracking-wider mb-1">Mode</label>
                <select value={editorLabelMode} onChange={e => setEditorLabelMode(e.target.value as 'overwrite' | 'merge')}
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg px-2 py-1.5 text-[11px] text-slate-100 focus:outline-none focus:border-indigo-500">
                  <option value="overwrite">Overwrite</option>
                  <option value="merge">Merge</option>
                </select>
              </div>
              <div className="flex-1">
                <label className="block text-[9px] font-bold text-slate-400 uppercase tracking-wider mb-1">Target Class</label>
                <select value={editorTargetClassOption} onChange={e => setEditorTargetClassOption(e.target.value as 'all' | 'active')}
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg px-2 py-1.5 text-[11px] text-slate-100 focus:outline-none focus:border-indigo-500">
                  <option value="all">All Classes</option>
                  <option value="active">Active ({activeClass})</option>
                </select>
              </div>
            </div>
            <div className="flex items-center gap-1.5 pt-1.5">
              <input type="checkbox" id="editor-filter-classes" checked={editorFilterByClasses}
                onChange={e => setEditorFilterByClasses(e.target.checked)}
                className="rounded border-slate-800 bg-slate-950 text-indigo-600 focus:ring-0 w-3.5 h-3.5 cursor-pointer" />
              <label htmlFor="editor-filter-classes" className="text-[10px] font-semibold text-slate-400 cursor-pointer select-none">
                Filter Detections by Project Classes
              </label>
            </div>
          </div>
          <button onClick={handleAutoLabelCurrent} disabled={isAiRunning}
            className="w-full bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-500 hover:to-indigo-500 disabled:from-slate-800 disabled:to-slate-800 text-white font-bold py-2.5 rounded-lg text-xs flex items-center justify-center gap-1.5 shadow-lg shadow-indigo-500/10 active:scale-95 transition-all">
            {isAiRunning ? (
              <><svg className="animate-spin h-4 w-4 text-white" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
              </svg>Running model...</>
            ) : (
              <><svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
              </svg>Run Model Annotation</>
            )}
          </button>
        </div>

        {/* Active class selection */}
        <div className="p-5 border-b border-slate-850 space-y-3">
          <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400">Active Drawing Class</h3>
          <div className="flex flex-wrap gap-2">
            {classes.map(cls => (
              <button key={cls.id} onClick={() => setActiveClass(cls.name)}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-all border ${
                  activeClass === cls.name ? 'bg-indigo-600/20 border-indigo-500 text-indigo-200' : 'bg-slate-950 border-slate-800 text-slate-400 hover:border-slate-700 hover:text-slate-300'
                }`}>
                <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: cls.color }} />
                {cls.name}
              </button>
            ))}
            {classes.length === 0 && <p className="text-slate-500 text-xs italic">No project classes defined.</p>}
          </div>
        </div>

        {/* Annotations list */}
        <div className="flex-1 flex flex-col min-h-0">
          <div className="p-4 border-b border-slate-850">
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400">Annotations ({annotations.length})</h3>
          </div>
          <div className="flex-1 overflow-y-auto p-4 space-y-2.5">
            {annotations.length === 0 ? (
              <p className="text-slate-500 text-xs italic text-center py-6">No annotations created yet.</p>
            ) : annotations.map(ann => {
              const isSelected = ann.id === selectedAnnId;
              return (
                <div key={ann.id} onClick={() => setSelectedAnnId(ann.id)}
                  className={`p-3 rounded-xl border flex flex-col justify-between cursor-pointer transition-all ${
                    isSelected ? 'border-indigo-500 bg-indigo-500/10' : 'border-slate-855 bg-slate-955/20 hover:border-slate-800'
                  }`}>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-1.5">
                      <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: ann.color }} />
                      {isSelected ? (
                        <select value={ann.label || ''} onChange={e => handleChangeSelectedClass(e.target.value)}
                          onClick={e => e.stopPropagation()}
                          className="bg-slate-950 border border-slate-800 rounded-md px-1.5 py-0.5 text-xs text-slate-100 font-mono focus:outline-none focus:border-indigo-500">
                          {classes.map(c => <option key={c.id} value={c.name}>{c.name}</option>)}
                          {!classes.some(c => c.name === ann.label) && ann.label && <option value={ann.label}>{ann.label}</option>}
                        </select>
                      ) : (
                        <span className="font-mono text-xs font-semibold text-slate-200 truncate max-w-[120px]">{ann.label}</span>
                      )}
                    </div>
                    <button onClick={e => { e.stopPropagation(); handleDeleteAnnotation(ann.id); }}
                      className="text-slate-500 hover:text-red-400 p-1 rounded transition-colors">
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
            })}
          </div>
        </div>

        {/* Bottom save bar */}
        <div className="p-4 border-t border-slate-850 bg-slate-950/80">
          <button onClick={async () => { const saved = await handleSaveAnnotations(); if (saved) onSaveAndExit(); }}
            className="w-full bg-slate-850 hover:bg-slate-800 border border-slate-750 text-slate-200 font-bold py-2.5 rounded-xl text-xs transition-all mb-2">
            Save & Exit
          </button>
          {currentImageIndex < images.length - 1 ? (
            <button onClick={handleNextImage}
              className="w-full bg-indigo-600 hover:bg-indigo-500 text-white font-bold py-2.5 rounded-xl text-xs shadow-lg shadow-indigo-500/10 active:scale-95 transition-all">
              Save & Next (Enter)
            </button>
          ) : (
            <button onClick={async () => { const saved = await handleSaveAnnotations(); if (saved) onSaveAndExit(); }}
              className="w-full bg-indigo-600 hover:bg-indigo-500 text-white font-bold py-2.5 rounded-xl text-xs shadow-lg shadow-indigo-500/10 active:scale-95 transition-all">
              Save & Finish
            </button>
          )}
        </div>
      </aside>
    </div>
  );
}
