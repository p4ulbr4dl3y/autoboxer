import { useState, useEffect, useRef, useCallback } from 'react';
import { api } from '../api/client';
import type { Annotation, ClassCategory, ImageItem } from '../types';

// ─── Types ───────────────────────────────────────────────────────────────────

export type ResizeMode = 'nw' | 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w' | 'move';

export interface EditorState {
  // Core state
  annotations: Annotation[];
  selectedAnnId: number | string | null;
  canvasMode: 'select' | 'draw';
  activeClass: string;
  isDirty: boolean;
  isAiLabeling: boolean;

  // Undo/Redo
  canUndo: boolean;
  canRedo: boolean;

  // Zoom / Pan
  zoom: number;
  panX: number;
  panY: number;
  isPanning: boolean;
  isZooming: boolean;
  activePointerCount: number;

  // Drawing
  isDrawing: boolean;
  drawStart: { x: number; y: number };
  drawEnd: { x: number; y: number };

  // Dragging / Resizing
  isDragging: boolean;
  resizeMode: ResizeMode;

  // UI toggles
  annotationFilter: Set<string>; // class names to show, empty = all

  // Canvas sizing
  renderedWidth: number;
  renderedHeight: number;

  // Context menu
  contextMenu: { x: number; y: number; annId: number | string } | null;

  // Dimension tooltip (shown during draw/resize)
  dimensionTooltip: { x: number; y: number; w: number; h: number } | null;
}

export interface EditorActions {
  setAnnotations: React.Dispatch<React.SetStateAction<Annotation[]>>;
  setSelectedAnnId: (id: number | string | null) => void;
  setCanvasMode: (mode: 'select' | 'draw') => void;
  setActiveClass: (name: string) => void;
  setAnnotationFilter: (f: Set<string>) => void;
  setContextMenu: (c: { x: number; y: number; annId: number | string } | null) => void;

  // Undo / Redo
  undo: () => void;
  redo: () => void;

  // Canvas event handlers (Pointer Events)
  handleCanvasPointerDown: (e: React.PointerEvent<HTMLDivElement>) => void;
  handleCanvasPointerMove: (e: React.PointerEvent<HTMLDivElement>) => void;
  handleCanvasPointerUp: (e: React.PointerEvent<HTMLDivElement>) => void;

  // Annotation CRUD
  handleDeleteAnnotation: (id: number | string) => void;
  handleChangeSelectedClass: (className: string) => void;
  handleDuplicateAnnotation: (id: number | string) => void;

  // Save / Navigation
  handleSaveAnnotations: () => Promise<boolean>;
  handleNextImage: () => Promise<void>;
  handlePrevImage: () => Promise<void>;

  // Refs (for external use)
  imageContainerRef: React.RefObject<HTMLDivElement | null>;
  imageRef: React.RefObject<HTMLImageElement | null>;
  updateRenderedDimensions: () => void;

  // Zoom / Pan setters (for UI buttons)
  setZoom: (z: number | ((prev: number) => number)) => void;
  setPanX: (x: number | ((prev: number) => number)) => void;
  setPanY: (y: number | ((prev: number) => number)) => void;
  handleResetZoom: () => void;
  handleSetZoomPreset: (preset: 'fit' | '100' | '200') => void;
  handleAutoLabelImage: () => Promise<void>;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function cloneAnnotations(anns: Annotation[]): Annotation[] {
  return anns.map(a => ({ ...a }));
}

/** Apply 8-corner resize logic to a box given a delta in original-image coords. */
function applyResize(
  box: { x1: number; y1: number; x2: number; y2: number },
  mode: ResizeMode,
  deltaOrigX: number,
  deltaOrigY: number,
  origW: number,
  origH: number,
) {
  let { x1, y1, x2, y2 } = box;
  const MIN_SIZE = 5;

  switch (mode) {
    case 'move':
      x1 += deltaOrigX; x2 += deltaOrigX;
      y1 += deltaOrigY; y2 += deltaOrigY;
      // Clamp to image bounds
      if (x1 < 0) { x2 -= x1; x1 = 0; }
      if (x2 > origW) { x1 -= (x2 - origW); x2 = origW; }
      if (y1 < 0) { y2 -= y1; y1 = 0; }
      if (y2 > origH) { y1 -= (y2 - origH); y2 = origH; }
      break;
    case 'nw':
      x1 = Math.min(box.x2 - MIN_SIZE, box.x1 + deltaOrigX);
      y1 = Math.min(box.y2 - MIN_SIZE, box.y1 + deltaOrigY);
      break;
    case 'n':
      y1 = Math.min(box.y2 - MIN_SIZE, box.y1 + deltaOrigY);
      break;
    case 'ne':
      x2 = Math.max(box.x1 + MIN_SIZE, box.x2 + deltaOrigX);
      y1 = Math.min(box.y2 - MIN_SIZE, box.y1 + deltaOrigY);
      break;
    case 'e':
      x2 = Math.max(box.x1 + MIN_SIZE, box.x2 + deltaOrigX);
      break;
    case 'se':
      x2 = Math.max(box.x1 + MIN_SIZE, box.x2 + deltaOrigX);
      y2 = Math.max(box.y1 + MIN_SIZE, box.y2 + deltaOrigY);
      break;
    case 's':
      y2 = Math.max(box.y1 + MIN_SIZE, box.y2 + deltaOrigY);
      break;
    case 'sw':
      x1 = Math.min(box.x2 - MIN_SIZE, box.x1 + deltaOrigX);
      y2 = Math.max(box.y1 + MIN_SIZE, box.y2 + deltaOrigY);
      break;
    case 'w':
      x1 = Math.min(box.x2 - MIN_SIZE, box.x1 + deltaOrigX);
      break;
  }

  return {
    x1: Math.max(0, Math.min(origW, x1)),
    y1: Math.max(0, Math.min(origH, y1)),
    x2: Math.max(0, Math.min(origW, x2)),
    y2: Math.max(0, Math.min(origH, y2)),
  };
}

/** Cursor for a given resize mode. */
export function cursorForResizeMode(mode: ResizeMode): string {
  switch (mode) {
    case 'nw': return 'nw-resize';
    case 'n': return 'n-resize';
    case 'ne': return 'ne-resize';
    case 'e': return 'e-resize';
    case 'se': return 'se-resize';
    case 's': return 's-resize';
    case 'sw': return 'sw-resize';
    case 'w': return 'w-resize';
    case 'move': return 'move';
  }
}

// ─── Hook ────────────────────────────────────────────────────────────────────

const MAX_HISTORY = 50;

export function useEditor(
  currentImageId: number,
  images: ImageItem[],
  classes: ClassCategory[],
  onSaveAndExit: () => void,
  onImageChange: (imageId: number) => void,
  setImages: React.Dispatch<React.SetStateAction<ImageItem[]>>,
  onError?: (title: string, message: string) => void,
  onDirtyChange?: (dirty: boolean) => void,
  onBeforeNavigate?: () => void,
) {
  const currentImage = images.find(img => img.id === currentImageId);
  const currentImageIndex = images.findIndex(img => img.id === currentImageId);

  // ── Core state ──────────────────────────────────────────────────────────
  const [annotations, setAnnotations] = useState<Annotation[]>([]);
  const [selectedAnnId, setSelectedAnnId] = useState<number | string | null>(null);
  const [canvasMode, setCanvasMode] = useState<'select' | 'draw'>('select');
  const [activeClass, setActiveClass] = useState<string>('');
  const [isDirty, setIsDirty] = useState(false);

  // ── Undo / Redo ─────────────────────────────────────────────────────────
  const [historyPast, setHistoryPast] = useState<Annotation[][]>([]);
  const [historyFuture, setHistoryFuture] = useState<Annotation[][]>([]);

  const pushHistory = useCallback((snapshot: Annotation[]) => {
    setHistoryPast(prev => {
      const next = [...prev, snapshot];
      if (next.length > MAX_HISTORY) next.shift();
      return next;
    });
    setHistoryFuture([]);
  }, []);

  const undo = useCallback(() => {
    if (historyPast.length === 0) return;
    const prev = historyPast[historyPast.length - 1];
    setHistoryPast(prevHistory => prevHistory.slice(0, -1));
    setHistoryFuture(prevFuture => [...prevFuture, cloneAnnotations(annotations)]);
    setAnnotations(prev);
    setIsDirty(true);
  }, [annotations, historyPast]);

  const redo = useCallback(() => {
    if (historyFuture.length === 0) return;
    const next = historyFuture[historyFuture.length - 1];
    setHistoryFuture(prevFuture => prevFuture.slice(0, -1));
    setHistoryPast(prevHistory => [...prevHistory, cloneAnnotations(annotations)]);
    setAnnotations(next);
    setIsDirty(true);
  }, [annotations, historyFuture]);

  const canUndo = historyPast.length > 0;
  const canRedo = historyFuture.length > 0;

  // ── Zoom / Pan ──────────────────────────────────────────────────────────
  const [zoom, setZoom] = useState(1);
  const [panX, setPanX] = useState(0);
  const [panY, setPanY] = useState(0);
  const [isPanning, setIsPanning] = useState(false);
  const [isZooming, setIsZooming] = useState(false);
  const [activePointerCount, setActivePointerCount] = useState(0);
  const zoomRef = useRef(1);
  const zoomIdleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const panStartRef = useRef({ x: 0, y: 0, panX: 0, panY: 0 });

  // Last known pointer coords (used to anchor zoom to cursor for buttons / Cmd+1/2)
  const lastPointerEventRef = useRef<{ clientX: number; clientY: number } | null>(null);

  // Multi-touch bookkeeping
  const pointersRef = useRef<Map<number, { x: number; y: number; type: string }>>(new Map());
  // For two-finger pan/pinch/swipe gesture
  const multiTouchRef = useRef<{
    startMidX: number; startMidY: number;
    startDist: number;
    startZoom: number;
    startPanX: number; startPanY: number;
    startTime: number;
    triggeredSwipe: boolean;
    tapCandidate: { annId: number | string; midX: number; midY: number; startTime: number } | null;
  } | null>(null);

  const markZooming = useCallback(() => {
    setIsZooming(true);
    if (zoomIdleTimerRef.current) clearTimeout(zoomIdleTimerRef.current);
    zoomIdleTimerRef.current = setTimeout(() => setIsZooming(false), 120);
  }, []);

  // ── Canvas sizing ───────────────────────────────────────────────────────
  const [renderedWidth, setRenderedWidth] = useState(0);
  const [renderedHeight, setRenderedHeight] = useState(0);
  const imageContainerRef = useRef<HTMLDivElement>(null);
  const imageRef = useRef<HTMLImageElement>(null);

  // Track the image container's own dimensions (it uses CSS w-[85%] h-[85%])
  // and compute the actual rendered image size (object-fit: contain).
  const [containerDim, setContainerDim] = useState({ width: 0, height: 0 });

  useEffect(() => {
    const container = imageContainerRef.current;
    if (!container) return;

    const syncDimensions = () => {
      const cw = container.clientWidth;
      const ch = container.clientHeight;
      if (cw === 0 || ch === 0) return;

      setContainerDim({ width: cw, height: ch });

      if (currentImage?.width && currentImage?.height) {
        // Compute actual image rendered size (object-fit: contain)
        const containerAspect = cw / ch;
        const imageAspect = currentImage.width / currentImage.height;
        let w: number, h: number;
        if (imageAspect > containerAspect) {
          w = cw;
          h = w / imageAspect;
        } else {
          h = ch;
          w = h * imageAspect;
        }
        setRenderedWidth(Math.round(w));
        setRenderedHeight(Math.round(h));
      } else {
        setRenderedWidth(cw);
        setRenderedHeight(ch);
      }
    };

    syncDimensions();
    const ro = new ResizeObserver(syncDimensions);
    ro.observe(container);
    return () => ro.disconnect();
  }, [currentImageId, currentImage?.width, currentImage?.height]);

  const updateRenderedDimensions = useCallback(() => {
    // No-op: dimensions are computed from the container ResizeObserver.
    // Kept for backward compatibility.
  }, []);

  /**
   * Clamp pan so the image never leaves the visible container area.
   * - zoom >= 1: image edges must stay within [0, containerSize].
   * - zoom < 1: image is centered (smaller than container).
   */
  const clampPan = useCallback((z: number, px: number, py: number): { x: number; y: number } => {
    const cw = containerDim.width;
    const ch = containerDim.height;
    if (cw === 0 || ch === 0) return { x: px, y: py };

    const imgW = renderedWidth * z;
    const imgH = renderedHeight * z;

    // Figma-style infinite canvas: Allow free panning at all zoom levels.
    // To ensure the image is never completely lost, we require at least a small
    // portion (e.g. 60px or the image size itself if it is smaller) to remain visible inside the container.
    const minOverlapX = Math.min(60, imgW);
    const minOverlapY = Math.min(60, imgH);

    const minX = -imgW + minOverlapX;
    const maxX = cw - minOverlapX;
    const minY = -imgH + minOverlapY;
    const maxY = ch - minOverlapY;

    return {
      x: Math.min(maxX, Math.max(minX, px)),
      y: Math.min(maxY, Math.max(minY, py)),
    };
  }, [renderedWidth, renderedHeight, containerDim]);

  const handleResetZoom = useCallback(() => {
    setZoom(1);
    markZooming();
    const cw = containerDim.width;
    const ch = containerDim.height;
    if (cw > 0 && ch > 0 && currentImage?.width && currentImage?.height) {
      const containerAspect = cw / ch;
      const imageAspect = currentImage.width / currentImage.height;
      let w: number, h: number;
      if (imageAspect > containerAspect) {
        w = cw;
        h = w / imageAspect;
      } else {
        h = ch;
        w = h * imageAspect;
      }
      setPanX((cw - w) / 2);
      setPanY((ch - h) / 2);
    } else {
      setPanX(0);
      setPanY(0);
    }
  }, [currentImage, containerDim, markZooming]);

  /**
   * Apply a zoom preset: 'fit' (fit-to-screen), '100' (100%), '200' (200%).
   * For '100'/'200' the zoom anchors at the last known pointer position (or container center).
   */
  const handleSetZoomPreset = useCallback((preset: 'fit' | '100' | '200') => {
    const cw = containerDim.width;
    const ch = containerDim.height;
    if (cw === 0 || ch === 0) return;
    markZooming();

    if (preset === 'fit') {
      handleResetZoom();
      return;
    }

    const targetZoom = preset === '100' ? 1 : 2;
    const rect = imageContainerRef.current?.getBoundingClientRect();
    const lastPointer = lastPointerEventRef.current;
    const anchorX = lastPointer && rect
      ? lastPointer.clientX - rect.left
      : cw / 2;
    const anchorY = lastPointer && rect
      ? lastPointer.clientY - rect.top
      : ch / 2;
    const scale = targetZoom / zoom;
    setZoom(targetZoom);
    setPanX(anchorX - (anchorX - panX) * scale);
    setPanY(anchorY - (anchorY - panY) * scale);
  }, [containerDim, handleResetZoom, markZooming, panX, panY, zoom]);

  // Keep zoomRef in sync (used by pinch handler to avoid stale closure)
  useEffect(() => { zoomRef.current = zoom; }, [zoom]);

  // Clamp pan after every zoom/pan change to keep the image in view
  useEffect(() => {
    if (renderedWidth === 0 || renderedHeight === 0 || !currentImage?.width || !currentImage?.height) return;

    // Skip clamping if the rendered dimensions are not yet synchronized with the current image
    const imgAspect = currentImage.width / currentImage.height;
    const renderedAspect = renderedWidth / renderedHeight;
    if (Math.abs(imgAspect - renderedAspect) > 0.01) return;

    const clamped = clampPan(zoom, panX, panY);
    if (clamped.x !== panX || clamped.y !== panY) {
      const handle = requestAnimationFrame(() => {
        setPanX(clamped.x);
        setPanY(clamped.y);
      });
      return () => cancelAnimationFrame(handle);
    }
  }, [zoom, panX, panY, renderedWidth, renderedHeight, currentImage, clampPan]);

  // Reset zoom/pan during rendering when image changes
  const [prevImageId, setPrevImageId] = useState(currentImageId);
  if (currentImageId !== prevImageId) {
    setPrevImageId(currentImageId);
    setZoom(1);
    setIsPanning(false);

    // Compute initial centered position immediately to avoid flicker
    const cw = containerDim.width;
    const ch = containerDim.height;
    if (cw > 0 && ch > 0 && currentImage?.width && currentImage?.height) {
      const containerAspect = cw / ch;
      const imageAspect = currentImage.width / currentImage.height;
      let w: number, h: number;
      if (imageAspect > containerAspect) {
        w = cw;
        h = w / imageAspect;
      } else {
        h = ch;
        w = h * imageAspect;
      }
      setPanX((cw - w) / 2);
      setPanY((ch - h) / 2);
    } else {
      setPanX(0);
      setPanY(0);
    }
  }

  // Center image on initial load when container dimensions and current image metadata are available
  const lastCenteredImageIdRef = useRef<number | null>(null);
  useEffect(() => {
    const cw = containerDim.width;
    const ch = containerDim.height;
    if (cw > 0 && ch > 0 && currentImage?.width && currentImage?.height) {
      if (lastCenteredImageIdRef.current !== currentImageId) {
        lastCenteredImageIdRef.current = currentImageId;
        
        const containerAspect = cw / ch;
        const imageAspect = currentImage.width / currentImage.height;
        let w: number, h: number;
        if (imageAspect > containerAspect) {
          w = cw;
          h = w / imageAspect;
        } else {
          h = ch;
          w = h * imageAspect;
        }
        
        setZoom(1);
        setPanX((cw - w) / 2);
        setPanY((ch - h) / 2);
      }
    }
  }, [containerDim, currentImageId, currentImage]);

  // ── Drawing state ───────────────────────────────────────────────────────
  const [isDrawing, setIsDrawing] = useState(false);
  const [drawStart, setDrawStart] = useState({ x: 0, y: 0 });
  const [drawEnd, setDrawEnd] = useState({ x: 0, y: 0 });

  // ── Dragging / Resizing state ───────────────────────────────────────────
  const [isDragging, setIsDragging] = useState(false);
  const [resizeMode, setResizeMode] = useState<ResizeMode>('move');
  const dragStartRef = useRef({ x: 0, y: 0 });
  const dragInitialBoxRef = useRef({ x1: 0, y1: 0, x2: 0, y2: 0 });
  const draggedAnnIdRef = useRef<number | string | null>(null);

  // rAF throttle for pointer moves
  const rafRef = useRef<number | null>(null);

  // ── UI toggles ──────────────────────────────────────────────────────────
  const [annotationFilter, setAnnotationFilter] = useState<Set<string>>(new Set());

  // ── Context menu ────────────────────────────────────────────────────────
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; annId: number | string } | null>(null);

  // ── Dimension tooltip ───────────────────────────────────────────────────
  const [dimensionTooltip, setDimensionTooltip] = useState<{ x: number; y: number; w: number; h: number } | null>(null);

  // ── Dirty tracking ──────────────────────────────────────────────────────
  useEffect(() => { onDirtyChange?.(isDirty); }, [isDirty, onDirtyChange]);

  useEffect(() => {
    if (!isDirty) return;
    const handler = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = ''; };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [isDirty]);

  // ── Active class init during rendering ──────────────────────────────────
  if (classes.length > 0 && !activeClass) {
    setActiveClass(classes[0].name);
  }

  // ── Fetch annotations ───────────────────────────────────────────────────
  const fetchAnnotations = useCallback(async (imageId: number) => {
    try {
      const data = await api.annotations.get(imageId);
      const mapped = data.map((ann: Annotation) => {
        const cls = classes.find(c => c.name === ann.label);
        return { ...ann, color: cls ? cls.color : '#34C759' };
      });
      setAnnotations(mapped);
      setSelectedAnnId(mapped.length > 0 ? mapped[0].id : null);
      setIsDirty(false);
      setHistoryPast([]);
      setHistoryFuture([]);
    } catch (e) {
      console.error(e);
    }
  }, [classes]);

  useEffect(() => {
    const load = async () => {
      await fetchAnnotations(currentImageId);
    };
    load();
  }, [currentImageId, fetchAnnotations]);

  // ── Save annotations ────────────────────────────────────────────────────
  const handleSaveAnnotations = useCallback(async (): Promise<boolean> => {
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
      const newStatus = cleaned.length > 0 ? 'labeled' : 'unlabeled';
      setImages(prev => prev.map(img => img.id === currentImageId ? { ...img, status: newStatus } : img));
      setIsDirty(false);
      return true;
    } catch (e) {
      console.error(e);
      const err = e as Error;
      onError?.('Save Failed', err?.message || 'Could not save annotations. Please try again.');
      return false;
    }
  }, [annotations, currentImageId, setImages, onError]);

  // ── Single-Image AI Auto-Labeling ────────────────────────────────────────
  const [isAiLabeling, setIsAiLabeling] = useState(false);

  const handleAutoLabelImage = useCallback(async () => {
    setIsAiLabeling(true);
    try {
      const params = new URLSearchParams();
      const predicted = await api.images.autoLabel(currentImageId, params);
      const mapped = predicted.map((ann: Annotation) => {
        const cls = classes.find(c => c.name === ann.label);
        return { ...ann, color: cls ? cls.color : '#34C759' };
      });
      setAnnotations(mapped);
      setSelectedAnnId(mapped.length > 0 ? mapped[0].id : null);
      setIsDirty(true);
      const newStatus = mapped.length > 0 ? 'labeled' : 'unlabeled';
      setImages(prev => prev.map(img => img.id === currentImageId ? { ...img, status: newStatus } : img));
    } catch (e) {
      console.error(e);
      onError?.('AI Auto-Label Failed', (e as Error).message || 'Single image auto-label prediction failed.');
    } finally {
      setIsAiLabeling(false);
    }
  }, [currentImageId, classes, setImages, onError]);

  // ── Navigation ──────────────────────────────────────────────────────────
  const handleNextImage = useCallback(async () => {
    const saved = await handleSaveAnnotations();
    if (saved && currentImageIndex < images.length - 1) {
      onDirtyChange?.(false);
      onBeforeNavigate?.();
      onImageChange(images[currentImageIndex + 1].id);
    }
  }, [handleSaveAnnotations, currentImageIndex, images, onImageChange, onDirtyChange, onBeforeNavigate]);

  const handlePrevImage = useCallback(async () => {
    const saved = await handleSaveAnnotations();
    if (saved && currentImageIndex > 0) {
      onDirtyChange?.(false);
      onBeforeNavigate?.();
      onImageChange(images[currentImageIndex - 1].id);
    }
  }, [handleSaveAnnotations, currentImageIndex, images, onImageChange, onDirtyChange, onBeforeNavigate]);

  // ── Coordinate helpers ──────────────────────────────────────────────────

  /** Convert pointer event coords to image-space pixels, accounting for zoom/pan. */
  const getImageCoords = useCallback((e: { clientX: number; clientY: number }): { x: number; y: number } => {
    if (!imageContainerRef.current) return { x: 0, y: 0 };
    const rect = imageContainerRef.current.getBoundingClientRect();
    const rawX = e.clientX - rect.left;
    const rawY = e.clientY - rect.top;
    // Undo zoom/pan transform to get image-relative coords
    const imgX = (rawX - panX) / zoom;
    const imgY = (rawY - panY) / zoom;
    return {
      x: Math.max(0, Math.min(renderedWidth, imgX)),
      y: Math.max(0, Math.min(renderedHeight, imgY)),
    };
  }, [panX, panY, zoom, renderedWidth, renderedHeight]);

  /** Convert image-space pixel coords to original image coords. */
  const toOriginalCoords = useCallback((x: number, y: number): { origX: number; origY: number } => {
    if (!currentImage) return { origX: 0, origY: 0 };
    const origW = currentImage.width || 1;
    const origH = currentImage.height || 1;
    return {
      origX: (x / renderedWidth) * origW,
      origY: (y / renderedHeight) * origH,
    };
  }, [currentImage, renderedWidth, renderedHeight]);

  const findAnnotationAtCoords = useCallback((x: number, y: number): Annotation | null => {
    if (!currentImage) return null;
    const { origX, origY } = toOriginalCoords(x, y);
    for (let i = annotations.length - 1; i >= 0; i--) {
      const ann = annotations[i];
      if (origX >= ann.x1 && origX <= ann.x2 && origY >= ann.y1 && origY <= ann.y2) return ann;
    }
    return null;
  }, [currentImage, annotations, toOriginalCoords]);

  // ── Pointer event handlers (unified mouse+touch with multi-touch) ──────

  /** Compute midpoint + distance of the two active touch pointers, or null if <2. */
  const getMultiTouch = useCallback(() => {
    const pts = Array.from(pointersRef.current.values()).filter(p => p.type === 'touch');
    if (pts.length < 2) return null;
    const a = pts[0];
    const b = pts[1];
    const midX = (a.x + b.x) / 2;
    const midY = (a.y + b.y) / 2;
    const dx = a.x - b.x;
    const dy = a.y - b.y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    return { midX, midY, dist };
  }, []);

  const handleCanvasPointerDown = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    // Right-click → context menu
    if (e.button === 2) {
      const coords = getImageCoords(e);
      const clickedAnn = findAnnotationAtCoords(coords.x, coords.y);
      if (clickedAnn) {
        setSelectedAnnId(clickedAnn.id);
        setContextMenu({ x: e.clientX, y: e.clientY, annId: clickedAnn.id });
      } else {
        setContextMenu(null);
      }
      return;
    }

    // Close context menu on any other click
    setContextMenu(null);

    // Middle-click → pan (desktop with mouse fallback)
    if (e.button === 1) {
      setIsPanning(true);
      panStartRef.current = { x: e.clientX, y: e.clientY, panX, panY };
      e.currentTarget.setPointerCapture(e.pointerId);
      return;
    }

    // Track this pointer for multi-touch bookkeeping
    pointersRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY, type: e.pointerType });
    setActivePointerCount(pointersRef.current.size);

    // Two-finger (touch) gesture: pan + pinch + swipe + tap
    if (e.pointerType === 'touch' && pointersRef.current.size === 2) {
      // Cancel any in-progress single-pointer drawing/dragging (the other finger was
      // its owner; this finger becomes part of the multi-touch gesture instead).
      if (isDrawing) {
        setIsDrawing(false);
        setDimensionTooltip(null);
      }
      if (isDragging) {
        setIsDragging(false);
        draggedAnnIdRef.current = null;
      }
      const mt = getMultiTouch();
      if (mt) {
        const rect = imageContainerRef.current?.getBoundingClientRect();
        const midImgX = rect ? (mt.midX - rect.left - panX) / zoom : 0;
        const midImgY = rect ? (mt.midY - rect.top - panY) / zoom : 0;
        const tappedAnn = findAnnotationAtCoords(
          Math.max(0, Math.min(renderedWidth, midImgX)),
          Math.max(0, Math.min(renderedHeight, midImgY)),
        );
        multiTouchRef.current = {
          startMidX: mt.midX,
          startMidY: mt.midY,
          startDist: mt.dist,
          startZoom: zoom,
          startPanX: panX,
          startPanY: panY,
          startTime: performance.now(),
          triggeredSwipe: false,
          tapCandidate: tappedAnn
            ? { annId: tappedAnn.id, midX: mt.midX, midY: mt.midY, startTime: performance.now() }
            : null,
        };
        setIsPanning(true);
        markZooming();
      }
      e.currentTarget.setPointerCapture(e.pointerId);
      return;
    }

    const coords = getImageCoords(e);

    if (canvasMode === 'draw') {
      setIsDrawing(true);
      setDrawStart(coords);
      setDrawEnd(coords);
      setDimensionTooltip(null);
      e.currentTarget.setPointerCapture(e.pointerId);
    } else {
      const clickedAnn = findAnnotationAtCoords(coords.x, coords.y);
      if (clickedAnn) {
        setSelectedAnnId(clickedAnn.id);
        setIsDragging(true);
        draggedAnnIdRef.current = clickedAnn.id;
        dragStartRef.current = coords;
        dragInitialBoxRef.current = { x1: clickedAnn.x1, y1: clickedAnn.y1, x2: clickedAnn.x2, y2: clickedAnn.y2 };
        setResizeMode('move');
        e.currentTarget.setPointerCapture(e.pointerId);
      } else {
        setSelectedAnnId(null);
      }
    }
  }, [panX, panY, canvasMode, getImageCoords, findAnnotationAtCoords, getMultiTouch, isDrawing, isDragging, markZooming, renderedWidth, renderedHeight, zoom]);

  const handlePointerMoveLogic = useCallback((e: { clientX: number; clientY: number; pointerId?: number; pointerType?: string }) => {
    // Update tracked position for this pointer (used by multi-touch)
    if (e.pointerId !== undefined && pointersRef.current.has(e.pointerId)) {
      const existing = pointersRef.current.get(e.pointerId)!;
      pointersRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY, type: existing.type });
    }

    // Two-finger pan + pinch + swipe
    if (multiTouchRef.current && (e.pointerType === 'touch' || pointersRef.current.size >= 2)) {
      const mt = getMultiTouch();
      if (mt) {
        const m = multiTouchRef.current;
        const rect = imageContainerRef.current?.getBoundingClientRect();
        const anchorX = rect ? m.startMidX - rect.left : 0;
        const anchorY = rect ? m.startMidY - rect.top : 0;

        // Pan from start: midpoint delta applied additively from start
        const dx = mt.midX - m.startMidX;
        const dy = mt.midY - m.startMidY;

        // Swipe detection: fast horizontal motion, horizontally dominant
        if (!m.triggeredSwipe) {
          const dt = performance.now() - m.startTime;
          if (
            Math.abs(dx) > 80 &&
            Math.abs(dx) > Math.abs(dy) * 1.5 &&
            dt < 500
          ) {
            m.triggeredSwipe = true;
            // Finger moved left (dx < 0) → next image, like Mac Preview
            if (dx < 0) void handleNextImage();
            else void handlePrevImage();
          }
        }

        // Tap candidate is invalidated as soon as motion exceeds threshold
        if (m.tapCandidate && Math.hypot(dx, dy) > 8) {
          m.tapCandidate = null;
        }

        if (mt.dist > 4) {
          const scale = mt.dist / m.startDist;
          const newZoom = Math.max(0.2, Math.min(8, m.startZoom * scale));
          const zoomScale = newZoom / m.startZoom;
          setPanX(anchorX - (anchorX - m.startPanX) * zoomScale + dx);
          setPanY(anchorY - (anchorY - m.startPanY) * zoomScale + dy);
          setZoom(newZoom);
          markZooming();
        } else {
          setPanX(m.startPanX + dx);
          setPanY(m.startPanY + dy);
        }
        return;
      }
    }

    // Single-pointer panning (middle-click drag)
    if (isPanning) {
      const dx = e.clientX - panStartRef.current.x;
      const dy = e.clientY - panStartRef.current.y;
      setPanX(panStartRef.current.panX + dx);
      setPanY(panStartRef.current.panY + dy);
      return;
    }

    const coords = getImageCoords(e);

    if (isDrawing) {
      setDrawEnd(coords);
      // Show dimension tooltip
      if (currentImage) {
        const origW = currentImage.width || 1;
        const origH = currentImage.height || 1;
        const x1 = Math.min(drawStart.x, coords.x);
        const y1 = Math.min(drawStart.y, coords.y);
        const x2 = Math.max(drawStart.x, coords.x);
        const y2 = Math.max(drawStart.y, coords.y);
        const w = Math.round(((x2 - x1) / renderedWidth) * origW);
        const h = Math.round(((y2 - y1) / renderedHeight) * origH);
        setDimensionTooltip({ x: coords.x + 15, y: coords.y + 15, w, h });
      }
      return;
    }

    if (isDragging && draggedAnnIdRef.current !== null && currentImage) {
      const deltaX = coords.x - dragStartRef.current.x;
      const deltaY = coords.y - dragStartRef.current.y;
      const origW = currentImage.width || 1;
      const origH = currentImage.height || 1;
      const deltaOrigX = (deltaX / renderedWidth) * origW;
      const deltaOrigY = (deltaY / renderedHeight) * origH;

      const box = dragInitialBoxRef.current;
      const newBox = applyResize(box, resizeMode, deltaOrigX, deltaOrigY, origW, origH);

      // Show dimension tooltip
      const w = Math.round(newBox.x2 - newBox.x1);
      const h = Math.round(newBox.y2 - newBox.y1);
      setDimensionTooltip({ x: coords.x + 15, y: coords.y + 15, w, h });

      setAnnotations(prev => prev.map(ann => {
        if (ann.id !== draggedAnnIdRef.current) return ann;
        return { ...ann, ...newBox };
      }));
    }
  }, [isPanning, isDrawing, isDragging, resizeMode, currentImage, getImageCoords, drawStart, renderedWidth, renderedHeight, getMultiTouch, handleNextImage, handlePrevImage, markZooming]);

  const handleCanvasPointerMove = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    lastPointerEventRef.current = e;
    if (rafRef.current !== null) return;
    rafRef.current = requestAnimationFrame(() => {
      rafRef.current = null;
      if (lastPointerEventRef.current) {
        handlePointerMoveLogic(lastPointerEventRef.current);
      }
    });
  }, [handlePointerMoveLogic]);

  const handleCanvasPointerUp = useCallback((e?: React.PointerEvent<HTMLDivElement>) => {
    // Remove this pointer from the multi-touch map first
    if (e && e.pointerId !== undefined) {
      pointersRef.current.delete(e.pointerId);
      setActivePointerCount(pointersRef.current.size);
    }

    // Two-finger tap completion: if the gesture ends here with little motion & a tap candidate
    if (multiTouchRef.current && pointersRef.current.size < 2) {
      const m = multiTouchRef.current;
      const tap = m.tapCandidate;
      if (tap) {
        const dt = performance.now() - tap.startTime;
        if (dt < 300) {
          // Open the context menu at the tap location
          setSelectedAnnId(tap.annId);
          setContextMenu({ x: tap.midX, y: tap.midY, annId: tap.annId });
        }
      }
      multiTouchRef.current = null;
      setIsPanning(false);
      return;
    }

    // If a multi-touch is still active (one finger up, one down), don't finalize
    if (pointersRef.current.size >= 2) {
      return;
    }

    if (isPanning) {
      setIsPanning(false);
      return;
    }

    const wasDragging = isDragging;

    if (isDrawing && currentImage) {
      setIsDrawing(false);
      setDimensionTooltip(null);
      const origW = currentImage.width || 1;
      const origH = currentImage.height || 1;
      const origX1 = (Math.min(drawStart.x, drawEnd.x) / renderedWidth) * origW;
      const origY1 = (Math.min(drawStart.y, drawEnd.y) / renderedHeight) * origH;
      const origX2 = (Math.max(drawStart.x, drawEnd.x) / renderedWidth) * origW;
      const origY2 = (Math.max(drawStart.y, drawEnd.y) / renderedHeight) * origH;

      if (origX2 - origX1 > 10 && origY2 - origY1 > 10) {
        pushHistory(cloneAnnotations(annotations));
        const cls = classes.find(c => c.name === activeClass);
        const tempId = `temp_${Date.now()}`;
        const newAnn: Annotation = {
          id: tempId, image_id: currentImage.id, box_id: annotations.length + 1,
          x1: Math.round(origX1), y1: Math.round(origY1), x2: Math.round(origX2), y2: Math.round(origY2),
          label: activeClass || 'object', color: cls ? cls.color : '#34C759',
        };
        setAnnotations(prev => [...prev, newAnn]);
        setSelectedAnnId(tempId);
        setIsDirty(true);


      }
      setCanvasMode('select');
    }

    if (wasDragging) {
      // Only push history if the box actually moved
      pushHistory(cloneAnnotations(annotations));
      setIsDirty(true);
      setDimensionTooltip(null);
    }

    setIsDragging(false);
    draggedAnnIdRef.current = null;
  }, [isPanning, isDrawing, isDragging, currentImage, drawStart, drawEnd, renderedWidth, renderedHeight,
      annotations, activeClass, classes,
      pushHistory, setCanvasMode]);

  // ── Annotation CRUD ─────────────────────────────────────────────────────

  const handleDeleteAnnotation = useCallback((id: number | string) => {
    pushHistory(cloneAnnotations(annotations));
    setAnnotations(prev => prev.filter(ann => ann.id !== id));
    if (selectedAnnId === id) setSelectedAnnId(null);
    setIsDirty(true);
  }, [annotations, selectedAnnId, pushHistory]);

  const handleChangeSelectedClass = useCallback((className: string) => {
    if (selectedAnnId === null) return;
    pushHistory(cloneAnnotations(annotations));
    const cls = classes.find(c => c.name === className);
    setAnnotations(prev => prev.map(ann =>
      ann.id === selectedAnnId ? { ...ann, label: className, color: cls ? cls.color : '#34C759' } : ann
    ));
    setIsDirty(true);
  }, [selectedAnnId, annotations, classes, pushHistory]);

  const handleDuplicateAnnotation = useCallback((id: number | string) => {
    const ann = annotations.find(a => a.id === id);
    if (!ann || !currentImage) return;
    pushHistory(cloneAnnotations(annotations));
    const tempId = `temp_${Date.now()}`;
    const dup: Annotation = {
      ...ann,
      id: tempId,
      image_id: currentImage.id,
      box_id: annotations.length + 1,
      x1: ann.x1 + 15,
      y1: ann.y1 + 15,
      x2: ann.x2 + 15,
      y2: ann.y2 + 15,
    };
    setAnnotations(prev => [...prev, dup]);
    setSelectedAnnId(tempId);
    setIsDirty(true);
  }, [annotations, currentImage, pushHistory]);

  // ── Zoom with wheel ─────────────────────────────────────────────────────
  // Cmd/Meta+scroll → zoom to cursor. Plain scroll → pan.
  // We use a non-passive listener so we can preventDefault (React 17+ onWheel is passive).
  useEffect(() => {
    const container = imageContainerRef.current;
    if (!container) return;

    const onWheel = (e: WheelEvent) => {
      // Only intercept wheel events that originated on the container itself
      if (!container.contains(e.target as Node)) return;
      e.preventDefault();

      const rect = container.getBoundingClientRect();
      const mouseX = e.clientX - rect.left;
      const mouseY = e.clientY - rect.top;
      lastPointerEventRef.current = { clientX: e.clientX, clientY: e.clientY };

      if (e.ctrlKey || e.metaKey) {
        // Zoom toward the cursor (gentle per-tick step for trackpad comfort)
        const factor = e.deltaY < 0 ? 1.06 : 0.944;
        setZoom(prevZoom => {
          const newZoom = Math.max(0.2, Math.min(8, prevZoom * factor));
          const scale = newZoom / prevZoom;
          setPanX(prev => mouseX - (mouseX - prev) * scale);
          setPanY(prev => mouseY - (mouseY - prev) * scale);
          return newZoom;
        });
        markZooming();
      } else {
        // Pan (works for both vertical and horizontal scroll deltas)
        setPanX(prev => prev - e.deltaX);
        setPanY(prev => prev - e.deltaY);
        markZooming();
      }
    };

    container.addEventListener('wheel', onWheel, { passive: false });
    return () => container.removeEventListener('wheel', onWheel);
  }, [markZooming]);

  // ── Keyboard shortcuts ──────────────────────────────────────────────────
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if (document.querySelector('[role="dialog"]')) return;

      // Space → prevent page scroll while editor has focus (legacy pan-via-space removed)
      if (e.code === 'Space' && !e.repeat) {
        e.preventDefault();
        return;
      }

      // Undo / Redo
      if ((e.metaKey || e.ctrlKey) && e.key === 'z') {
        e.preventDefault();
        if (e.shiftKey) redo();
        else undo();
        return;
      }

      // Zoom presets: Cmd+0 = fit, Cmd+1 = 100%, Cmd+2 = 200%
      if ((e.metaKey || e.ctrlKey) && (e.key === '0' || e.key === '1' || e.key === '2')) {
        e.preventDefault();
        const preset = e.key === '0' ? 'fit' : e.key === '1' ? '100' : '200';
        handleSetZoomPreset(preset as 'fit' | '100' | '200');
        return;
      }

      // Delete
      if (e.key === 'Delete' || e.key === 'Backspace') {
        if (selectedAnnId !== null) handleDeleteAnnotation(selectedAnnId);
        return;
      }

      // Navigation
      if (e.key === 'ArrowRight') { handleNextImage(); return; }
      if (e.key === 'ArrowLeft') { handlePrevImage(); return; }
      if (e.key === 'Enter') {
        if (currentImageIndex < images.length - 1) handleNextImage();
        else handleSaveAnnotations().then(saved => { if (saved) onSaveAndExit(); });
        return;
      }

      // Canvas modes
      if (e.key === 'd' || e.key === 'в') { setCanvasMode('draw'); return; }
      if (e.key === 's' || e.key === 'ы') { setCanvasMode('select'); return; }

      // Class hotkeys 1-9
      const num = parseInt(e.key, 10);
      if (num >= 1 && num <= 9 && num <= classes.length) {
        setActiveClass(classes[num - 1].name);
        return;
      }

      // Escape → close context menu, switch to select mode
      if (e.key === 'Escape') {
        setContextMenu(null);
        setCanvasMode('select');
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [selectedAnnId, annotations, currentImageId, currentImageIndex, images, classes,
      undo, redo, handleDeleteAnnotation, handleNextImage, handlePrevImage,
      handleSaveAnnotations, handleResetZoom, handleSetZoomPreset, onSaveAndExit]);

  // Cleanup rAF on unmount
  useEffect(() => {
    return () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    };
  }, []);

  // ── Resize handles: start drag from a specific handle ───────────────────
  const handleStartResize = useCallback((annId: number | string, mode: ResizeMode, e: React.PointerEvent) => {
    e.stopPropagation();
    const ann = annotations.find(a => a.id === annId);
    if (!ann) return;
    setIsDragging(true);
    draggedAnnIdRef.current = annId;
    dragStartRef.current = getImageCoords(e);
    dragInitialBoxRef.current = { x1: ann.x1, y1: ann.y1, x2: ann.x2, y2: ann.y2 };
    setResizeMode(mode);
    setSelectedAnnId(annId);
  }, [annotations, getImageCoords]);

  // ── Return ──────────────────────────────────────────────────────────────
  const state: EditorState = {
    annotations, selectedAnnId, canvasMode, activeClass, isDirty,
    canUndo, canRedo,
    zoom, panX, panY, isPanning, isZooming, activePointerCount,
    isDrawing, drawStart, drawEnd,
    isDragging, resizeMode,
    annotationFilter,
    renderedWidth, renderedHeight,
    contextMenu,
    dimensionTooltip,
    isAiLabeling,
  };

  const actions: EditorActions = {
    setAnnotations, setSelectedAnnId, setCanvasMode, setActiveClass,
    setAnnotationFilter, setContextMenu,
    undo, redo,
    handleCanvasPointerDown, handleCanvasPointerMove, handleCanvasPointerUp,
    handleDeleteAnnotation, handleChangeSelectedClass, handleDuplicateAnnotation,
    handleSaveAnnotations, handleNextImage, handlePrevImage,
    imageContainerRef, imageRef, updateRenderedDimensions,
    setZoom, setPanX, setPanY, handleResetZoom, handleSetZoomPreset,
    handleAutoLabelImage,
  };

  return { state, actions, currentImage, currentImageIndex, handleStartResize };
}
