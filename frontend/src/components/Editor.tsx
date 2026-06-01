import { useMemo } from 'react';
import { useEditor, cursorForResizeMode, type ResizeMode } from '../hooks/useEditor';
import { api } from '../api/client';
import type { ClassCategory, ImageItem } from '../types';

// ─── Resize handle positions ─────────────────────────────────────────────────

const RESIZE_HANDLES: { mode: ResizeMode; className: string; style: React.CSSProperties }[] = [
  { mode: 'nw', className: 'cursor-nw-resize', style: { top: -5, left: -5 } },
  { mode: 'n',  className: 'cursor-n-resize',  style: { top: -5, left: '50%', transform: 'translateX(-50%)' } },
  { mode: 'ne', className: 'cursor-ne-resize', style: { top: -5, right: -5 } },
  { mode: 'e',  className: 'cursor-e-resize',  style: { top: '50%', right: -5, transform: 'translateY(-50%)' } },
  { mode: 'se', className: 'cursor-se-resize', style: { bottom: -5, right: -5 } },
  { mode: 's',  className: 'cursor-s-resize',  style: { bottom: -5, left: '50%', transform: 'translateX(-50%)' } },
  { mode: 'sw', className: 'cursor-sw-resize', style: { bottom: -5, left: -5 } },
  { mode: 'w',  className: 'cursor-w-resize',  style: { top: '50%', left: -5, transform: 'translateY(-50%)' } },
];

// ─── SVG Icons ───────────────────────────────────────────────────────────────

const IconCursor = () => (
  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
      d="M15 15l-2 5L9 9l11 4-5 2zm0 0l5 5M7.188 2.239l.777 2.897M5.136 7.965l-2.898-.777M13.95 4.05l-2.122 2.122m-5.657 5.656l-2.12 2.122" />
  </svg>
);

const IconDraw = () => (
  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
  </svg>
);

const IconUndo = () => (
  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h10a5 5 0 015 5v2M3 10l4-4M3 10l4 4" />
  </svg>
);

const IconRedo = () => (
  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 10H11a5 5 0 00-5 5v2M21 10l-4-4M21 10l-4 4" />
  </svg>
);

const IconCopy = () => (
  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
      d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
  </svg>
);

const IconTrash = () => (
  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
      d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
  </svg>
);

const IconZoomIn = () => (
  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0zM10 7v6m3-3H7" />
  </svg>
);

const IconZoomOut = () => (
  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0zM13 10H7" />
  </svg>
);

// ─── Component ───────────────────────────────────────────────────────────────

interface EditorProps {
  currentImageId: number;
  images: ImageItem[];
  classes: ClassCategory[];
  onSaveAndExit: () => void;
  onImageChange: (imageId: number) => void;
  setImages: React.Dispatch<React.SetStateAction<ImageItem[]>>;
  onError?: (title: string, message: string) => void;
  onDirtyChange?: (dirty: boolean) => void;
  onBeforeNavigate?: () => void;
}

export default function Editor({
  currentImageId, images, classes, onSaveAndExit, onImageChange, setImages, onError, onDirtyChange, onBeforeNavigate,
}: EditorProps) {

  const { state, actions, currentImage, currentImageIndex, handleStartResize } = useEditor(
    currentImageId, images, classes, onSaveAndExit, onImageChange, setImages, onError, onDirtyChange, onBeforeNavigate,
  );

  const {
    annotations, selectedAnnId, canvasMode, activeClass, isDirty,
    canUndo, canRedo,
    zoom, panX, panY, isPanning, spaceHeld,
    isDrawing, drawStart, drawEnd,
    isDragging, resizeMode,
    annotationFilter,
    renderedWidth, renderedHeight,
    contextMenu,
    dimensionTooltip,
  } = state;

  const {
    setSelectedAnnId, setCanvasMode, setActiveClass,
    setAnnotationFilter, setContextMenu,
    undo, redo,
    handleCanvasPointerDown, handleCanvasPointerMove, handleCanvasPointerUp,
    handleDeleteAnnotation, handleChangeSelectedClass, handleDuplicateAnnotation,
    handleSaveAnnotations, handleNextImage, handlePrevImage,
    imageContainerRef, imageRef,
    setZoom, setPanX, setPanY, handleWheel, handleResetZoom,
  } = actions;

  // ── Derived state ─────────────────────────────────────────────────────

  const filteredAnnotations = useMemo(() => {
    if (annotationFilter.size === 0) return annotations;
    return annotations.filter(a => annotationFilter.has(a.label || ''));
  }, [annotations, annotationFilter]);

  const uniqueClassNames = useMemo(() => {
    return [...new Set(annotations.map(a => a.label || ''))];
  }, [annotations]);

  const cursorClass = useMemo(() => {
    if (spaceHeld || isPanning) return 'cursor-grab';
    if (canvasMode === 'draw') return 'cursor-crosshair';
    if (isDragging && resizeMode !== 'move') return cursorForResizeMode(resizeMode);
    return 'cursor-default';
  }, [spaceHeld, isPanning, canvasMode, isDragging, resizeMode]);

  // ── Context menu handler ──────────────────────────────────────────────

  const handleContextMenuAction = (action: 'delete' | 'duplicate' | string) => {
    if (!contextMenu) return;
    if (action === 'delete') {
      handleDeleteAnnotation(contextMenu.annId);
    } else if (action === 'duplicate') {
      handleDuplicateAnnotation(contextMenu.annId);
    } else {
      // It's a class name
      setSelectedAnnId(contextMenu.annId);
      handleChangeSelectedClass(action);
    }
    setContextMenu(null);
  };

  if (!currentImage) return null;



  return (
    <div className="flex-1 flex overflow-hidden h-[calc(100vh-69px)]">

      {/* ── Left sidebar: Thumbnails ─────────────────────────────────── */}
      <aside className="w-48 border-r border-slate-850 bg-slate-950/60 flex flex-col flex-shrink-0">
        <div className="p-4 border-b border-slate-850">
          <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400">Dataset Images</h3>
          <p className="text-[10px] text-slate-500 mt-0.5">{currentImageIndex + 1} of {images.length}</p>
        </div>
        <div className="flex-1 overflow-y-auto p-3 space-y-2">
          {images.map(img => (
            <div key={img.id}
              onClick={async () => { const saved = await handleSaveAnnotations(); if (saved) { onDirtyChange?.(false); onBeforeNavigate?.(); onImageChange(img.id); } }}
              className={`p-1.5 rounded-lg border cursor-pointer transition-all ${
                img.id === currentImageId ? 'border-white bg-white/5 shadow-sm' : 'border-slate-850 bg-slate-900/30 hover:border-slate-750'
              }`}>
              <div className="aspect-video w-full rounded overflow-hidden bg-slate-955">
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

      {/* ── Center Canvas ────────────────────────────────────────────── */}
      <section className="flex-1 bg-slate-955 flex flex-col items-center justify-center relative overflow-hidden canvas-grid">

        {/* ── Toolbar ────────────────────────────────────────────────── */}
        <div className="absolute top-4 left-6 bg-slate-900/90 border border-slate-850 rounded-xl p-1.5 flex items-center gap-1.5 z-10 backdrop-blur shadow-2xl">
          {/* Select / Draw mode */}
          <button onClick={() => setCanvasMode('select')} title="Select Mode (S)"
            className={`p-2 rounded-lg transition-all ${canvasMode === 'select' ? 'bg-slate-850 text-white border border-slate-750/80 shadow-sm' : 'text-slate-400 hover:text-slate-200 border border-transparent'}`}>
            <IconCursor />
          </button>
          <button onClick={() => setCanvasMode('draw')} title="Draw Bounding Box (D)"
            className={`p-2 rounded-lg transition-all ${canvasMode === 'draw' ? 'bg-slate-850 text-white border border-slate-750/80 shadow-sm' : 'text-slate-400 hover:text-slate-200 border border-transparent'}`}>
            <IconDraw />
          </button>

          <div className="h-4 w-[1px] bg-slate-800" />

          {/* Undo / Redo */}
          <button onClick={undo} disabled={!canUndo} title="Undo (Cmd+Z)"
            className="p-2 rounded-lg text-slate-400 hover:text-white disabled:opacity-30 disabled:pointer-events-none transition-all">
            <IconUndo />
          </button>
          <button onClick={redo} disabled={!canRedo} title="Redo (Cmd+Shift+Z)"
            className="p-2 rounded-lg text-slate-400 hover:text-white disabled:opacity-30 disabled:pointer-events-none transition-all">
            <IconRedo />
          </button>


        </div>

        {/* ── Zoom controls (top-right) ──────────────────────────────── */}
        <div className="absolute top-4 right-6 bg-slate-900/90 border border-slate-850 rounded-xl p-1.5 flex items-center gap-1.5 z-10 backdrop-blur shadow-2xl">
          <button onClick={() => {
            const container = imageContainerRef.current;
            if (!container) return;
            const rect = container.getBoundingClientRect();
            const cx = rect.width / 2;
            const cy = rect.height / 2;
            const newZoom = Math.min(8, zoom * 1.25);
            const scale = newZoom / zoom;
            setPanX(cx - (cx - panX) * scale);
            setPanY(cy - (cy - panY) * scale);
            setZoom(newZoom);
          }} title="Zoom In"
            className="p-2 rounded-lg text-slate-400 hover:text-white transition-all">
            <IconZoomIn />
          </button>
          <button onClick={handleResetZoom} title="Reset Zoom (Cmd+0)"
            className="px-2 py-2 rounded-lg text-[10px] text-slate-500 hover:text-white font-mono transition-all">
            {Math.round(zoom * 100)}%
          </button>
          <button onClick={() => {
            const container = imageContainerRef.current;
            if (!container) return;
            const rect = container.getBoundingClientRect();
            const cx = rect.width / 2;
            const cy = rect.height / 2;
            const newZoom = Math.max(0.2, zoom * 0.8);
            const scale = newZoom / zoom;
            setPanX(cx - (cx - panX) * scale);
            setPanY(cy - (cy - panY) * scale);
            setZoom(newZoom);
          }} title="Zoom Out"
            className="p-2 rounded-lg text-slate-400 hover:text-white transition-all">
            <IconZoomOut />
          </button>
        </div>

        {/* ── Navigation arrows ──────────────────────────────────────── */}
        <div className="absolute left-6 inset-y-0 flex items-center pointer-events-none">
          <button onClick={handlePrevImage} disabled={currentImageIndex === 0} aria-label="Previous image" title="Previous image (←)"
            className="bg-slate-900/80 border border-slate-850 hover:border-slate-750 hover:bg-slate-855 text-slate-300 w-10 h-10 rounded-full flex items-center justify-center pointer-events-auto hover:scale-105 active:scale-95 disabled:opacity-30 disabled:pointer-events-none transition-all shadow-xl">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          </button>
        </div>
        <div className="absolute right-6 inset-y-0 flex items-center pointer-events-none">
          <button onClick={handleNextImage} disabled={currentImageIndex === images.length - 1} aria-label="Next image" title="Next image (→)"
            className="bg-slate-900/80 border border-slate-850 hover:border-slate-750 hover:bg-slate-855 text-slate-300 w-10 h-10 rounded-full flex items-center justify-center pointer-events-auto hover:scale-105 active:scale-95 disabled:opacity-30 disabled:pointer-events-none transition-all shadow-xl">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
          </button>
        </div>

        {/* ── Image container with zoom/pan transform ─────────────────── */}
        <div ref={imageContainerRef}
          onPointerDown={handleCanvasPointerDown}
          onPointerMove={handleCanvasPointerMove}
          onPointerUp={handleCanvasPointerUp}
          onDoubleClick={handleResetZoom}
          onWheel={handleWheel}
          onContextMenu={e => e.preventDefault()}
          className={`relative w-full h-full select-none touch-none overflow-hidden bg-transparent ${cursorClass}`}>
          <div
            className="border border-slate-800 shadow-2xl rounded-md bg-slate-950/60 overflow-hidden"
            style={{
              transform: `translate(${panX}px, ${panY}px) scale(${zoom})`,
              transformOrigin: '0 0',
              width: `${renderedWidth}px`,
              height: `${renderedHeight}px`,
              position: 'absolute',
              left: 0,
              top: 0,
            }}>
            <img ref={imageRef} src={api.images.fileUrl(currentImageId)} alt=""
              style={{ width: '100%', height: '100%' }}
              className="block pointer-events-none" />

            {renderedWidth > 0 && renderedHeight > 0 && (
              <div className="absolute inset-0 w-full h-full pointer-events-auto z-20 overflow-hidden">
                {filteredAnnotations.map(ann => {
                  const origW = currentImage.width || 1;
                  const origH = currentImage.height || 1;
                  const left = (ann.x1 / origW) * renderedWidth;
                  const top = (ann.y1 / origH) * renderedHeight;
                  const width = ((ann.x2 - ann.x1) / origW) * renderedWidth;
                  const height = ((ann.y2 - ann.y1) / origH) * renderedHeight;
                  const isSelected = ann.id === selectedAnnId;
                  const boxColor = ann.color || '#34C759';

                  const r = parseInt(boxColor.slice(1, 3), 16);
                  const g = parseInt(boxColor.slice(3, 5), 16);
                  const b = parseInt(boxColor.slice(5, 7), 16);
                  const fillColor = `rgba(${r}, ${g}, ${b}, 0.15)`;

                  return (
                    <div key={ann.id}
                      style={{
                        left: `${left}px`, top: `${top}px`,
                        width: `${width}px`, height: `${height}px`,
                        borderColor: boxColor,
                        backgroundColor: fillColor,
                      }}
                      className={`absolute border-2 transition-shadow ${isSelected ? 'ring-2 ring-white/50 shadow-2xl' : 'hover:bg-white/5'}`}>
                      {/* Label */}
                      <div style={{ backgroundColor: boxColor }}
                        className="absolute -top-6 left-[-2px] text-[10px] text-white px-2 py-0.5 rounded font-mono font-bold whitespace-nowrap shadow select-none">
                        {ann.label}
                      </div>
                      {/* Resize handles (only when selected) */}
                      {isSelected && RESIZE_HANDLES.map(h => (
                        <div key={h.mode}
                          onPointerDown={e => handleStartResize(ann.id, h.mode, e)}
                          style={h.style}
                          className={`absolute w-2.5 h-2.5 bg-white border-2 border-slate-800 rounded-full shadow-md z-30 transition-transform hover:scale-125 ${h.className}`} />
                      ))}
                    </div>
                  );
                })}

                {/* Drawing preview */}
                {isDrawing && (
                  <div style={{
                    left: `${Math.min(drawStart.x, drawEnd.x)}px`,
                    top: `${Math.min(drawStart.y, drawEnd.y)}px`,
                    width: `${Math.abs(drawEnd.x - drawStart.x)}px`,
                    height: `${Math.abs(drawEnd.y - drawStart.y)}px`,
                  }} className="absolute border border-dashed border-white bg-white/10 pointer-events-none" />
                )}
              </div>
            )}
          </div>
        </div>

        {/* ── Dimension tooltip ──────────────────────────────────────── */}
        {dimensionTooltip && (
          <div style={{
            position: 'fixed',
            left: dimensionTooltip.x,
            top: dimensionTooltip.y,
            transform: 'translate(10px, 10px)',
          }} className="bg-slate-900/95 border border-slate-700 text-slate-200 text-[10px] font-mono px-2 py-1 rounded-lg shadow-xl pointer-events-none z-50">
            {dimensionTooltip.w} × {dimensionTooltip.h}px
          </div>
        )}

      </section>

      {/* ── Context Menu ────────────────────────────────────────────── */}
      {contextMenu && (
        <div className="fixed z-50"
          style={{ left: contextMenu.x, top: contextMenu.y }}
          onContextMenu={e => e.preventDefault()}>
          <div className="bg-slate-900 border border-slate-700 rounded-xl shadow-2xl py-1.5 min-w-[160px] backdrop-blur"
            role="menu">
            <button onClick={() => handleContextMenuAction('delete')}
              className="w-full text-left px-4 py-2 text-xs text-red-400 hover:bg-red-500/10 flex items-center gap-2 transition-colors">
              <IconTrash /> Delete
            </button>
            <button onClick={() => handleContextMenuAction('duplicate')}
              className="w-full text-left px-4 py-2 text-xs text-slate-300 hover:bg-slate-800 flex items-center gap-2 transition-colors">
              <IconCopy /> Duplicate
            </button>
            {classes.length > 1 && (
              <>
                <div className="h-[1px] bg-slate-800 mx-3 my-1" />
                <p className="px-4 py-1 text-[9px] text-slate-500 uppercase tracking-wider font-bold">Change Class</p>
                {classes.map(cls => (
                  <button key={cls.id} onClick={() => handleContextMenuAction(cls.name)}
                    className="w-full text-left px-4 py-1.5 text-xs text-slate-300 hover:bg-slate-800 flex items-center gap-2 transition-colors">
                    <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: cls.color }} />
                    {cls.name}
                  </button>
                ))}
              </>
            )}
          </div>
        </div>
      )}

      {/* Click-away to close context menu */}
      {contextMenu && (
        <div className="fixed inset-0 z-40" onClick={() => setContextMenu(null)} />
      )}

      {/* ── Right sidebar ───────────────────────────────────────────── */}
      <aside className="w-80 border-l border-slate-850 bg-slate-900/40 backdrop-blur-md flex flex-col flex-shrink-0">

        {/* Active class selection */}
        <div className="p-5 border-b border-slate-850 space-y-3">
          <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400">Active Drawing Class</h3>
          <div className="flex flex-wrap gap-2">
            {classes.map((cls, i) => (
              <button key={cls.id} onClick={() => setActiveClass(cls.name)}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-all border ${
                  activeClass === cls.name ? 'bg-slate-850 border border-slate-750 text-white shadow-sm' : 'bg-slate-955 border-slate-800 text-slate-450 hover:border-slate-700 hover:text-slate-200'
                }`}>
                <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: cls.color }} />
                {cls.name}
                {/* Hotkey badge */}
                {i < 9 && (
                  <span className="ml-0.5 text-[8px] bg-slate-800/80 text-slate-500 px-1 rounded font-mono">{i + 1}</span>
                )}
              </button>
            ))}
            {classes.length === 0 && <p className="text-slate-500 text-xs italic">No project classes defined.</p>}
          </div>
        </div>

        {/* Annotations list */}
        <div className="flex-1 flex flex-col min-h-0">
          <div className="p-4 border-b border-slate-850 space-y-2">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400">Annotations ({annotations.length})</h3>
            </div>
            {/* Class filter */}
            {uniqueClassNames.length > 1 && (
              <div className="flex flex-wrap gap-1">
                <button onClick={() => setAnnotationFilter(new Set())}
                  className={`px-2.5 py-0.5 rounded text-[10px] font-mono transition-all ${
                    annotationFilter.size === 0 ? 'bg-slate-850 text-slate-200 border border-slate-750' : 'text-slate-500 hover:text-slate-350 border border-slate-800'
                  }`}>
                  All
                </button>
                {uniqueClassNames.map(name => (
                  <button key={name}
                    onClick={() => {
                      const next = new Set(annotationFilter);
                      if (next.has(name)) next.delete(name); else next.add(name);
                      setAnnotationFilter(next);
                    }}
                    className={`px-2.5 py-0.5 rounded text-[10px] font-mono transition-all ${
                      annotationFilter.has(name) ? 'bg-slate-850 text-slate-200 border border-slate-750' : 'text-slate-500 hover:text-slate-350 border border-slate-800'
                    }`}>
                    {name}
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="flex-1 overflow-y-auto p-4 space-y-2.5">
            {filteredAnnotations.length === 0 ? (
              <p className="text-slate-500 text-xs italic text-center py-6">
                {annotations.length === 0 ? 'No annotations created yet.' : 'No annotations match filter.'}
              </p>
            ) : filteredAnnotations.map(ann => {
              const isSelected = ann.id === selectedAnnId;
              return (
                <div key={ann.id} onClick={() => setSelectedAnnId(ann.id)}
                  className={`p-3 rounded-xl border flex flex-col justify-between cursor-pointer transition-all ${
                    isSelected ? 'border-slate-500 bg-slate-850/50 shadow-sm' : 'border-slate-850 bg-slate-955/20 hover:border-slate-800'
                  }`}>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-1.5">
                      <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: ann.color }} />
                      {isSelected ? (
                        <select value={ann.label || ''} onChange={e => handleChangeSelectedClass(e.target.value)}
                           onClick={e => e.stopPropagation()}
                          className="bg-slate-950 border border-slate-800 rounded-md px-1.5 py-0.5 text-xs text-slate-100 font-mono focus:outline-none focus:border-slate-700">
                          {classes.map(c => <option key={c.id} value={c.name}>{c.name}</option>)}
                          {!classes.some(c => c.name === ann.label) && ann.label && <option value={ann.label}>{ann.label}</option>}
                        </select>
                      ) : (
                        <span className="font-mono text-xs font-semibold text-slate-200 truncate max-w-[120px]">{ann.label}</span>
                      )}
                    </div>
                    <button onClick={e => { e.stopPropagation(); handleDeleteAnnotation(ann.id); }}
                      aria-label={`Delete ${ann.label || 'annotation'}`} title="Delete annotation"
                      className="text-slate-500 hover:text-red-400 p-1 rounded transition-colors">
                      <IconTrash />
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

        {/* Keyboard shortcuts hint */}
        <div className="px-4 py-2 border-t border-slate-850/50">
          <p className="text-[9px] text-slate-600 font-mono leading-relaxed">
            D=draw S=select 1-9=class Del=delete Space+drag=pan Scroll=zoom Cmd+Z=undo
          </p>
        </div>

        {/* Bottom save bar */}
        <div className="p-4 border-t border-slate-850 bg-slate-950/80">
          <button onClick={async () => { const saved = await handleSaveAnnotations(); if (saved) onSaveAndExit(); }}
            className="w-full bg-slate-850 hover:bg-slate-800 border border-slate-750 text-slate-200 font-bold py-2.5 rounded-xl text-xs transition-all mb-2">
            Save & Exit
          </button>
          {currentImageIndex < images.length - 1 ? (
            <button onClick={handleNextImage}
              className="w-full bg-white hover:bg-slate-200 active:scale-95 text-slate-950 font-bold py-2.5 rounded-xl text-xs shadow-md transition-all">
              Save & Next (Enter)
            </button>
          ) : (
            <button onClick={async () => { const saved = await handleSaveAnnotations(); if (saved) onSaveAndExit(); }}
              className="w-full bg-white hover:bg-slate-200 active:scale-95 text-slate-950 font-bold py-2.5 rounded-xl text-xs shadow-md transition-all">
              Save & Finish
            </button>
          )}
          {isDirty && (
            <p className="text-[10px] text-amber-400/60 text-center mt-2 font-mono">● Unsaved changes</p>
          )}
        </div>
      </aside>
    </div>
  );
}
