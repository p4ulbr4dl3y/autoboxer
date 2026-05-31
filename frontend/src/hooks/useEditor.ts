import { useState, useEffect, useCallback } from 'react';
import { api } from '../api/client';
import type { Annotation, ClassCategory, ImageItem } from '../types';

export function useEditor(
  currentImageId: number | null,
  currentImage: ImageItem | undefined,
  classes: ClassCategory[],
  renderedWidth: number,
  renderedHeight: number,
) {
  const [annotations, setAnnotations] = useState<Annotation[]>([]);
  const [selectedAnnId, setSelectedAnnId] = useState<number | string | null>(null);
  const [canvasMode, setCanvasMode] = useState<'select' | 'draw'>('select');
  const [activeClass, setActiveClass] = useState<string>('');

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

  // Fetch annotations when image changes
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
    if (currentImageId) {
      fetchAnnotations(currentImageId);
    }
  }, [currentImageId, fetchAnnotations]);

  // Save annotations
  const handleSaveAnnotations = useCallback(async (imageId: number) => {
    try {
      const cleaned = annotations.map((ann, index) => ({
        box_id: index + 1,
        x1: Math.round(ann.x1),
        y1: Math.round(ann.y1),
        x2: Math.round(ann.x2),
        y2: Math.round(ann.y2),
        label: ann.label,
      }));
      await api.annotations.update(imageId, cleaned);
      return true;
    } catch (e) {
      console.error(e);
      return false;
    }
  }, [annotations]);

  // Delete annotation
  const handleDeleteAnnotation = useCallback((id: number | string) => {
    setAnnotations(prev => prev.filter(ann => ann.id !== id));
    if (selectedAnnId === id) setSelectedAnnId(null);
  }, [selectedAnnId]);

  // Change class of selected annotation
  const handleChangeSelectedClass = useCallback((className: string) => {
    if (selectedAnnId === null) return;
    const cls = classes.find(c => c.name === className);
    setAnnotations(prev =>
      prev.map(ann =>
        ann.id === selectedAnnId
          ? { ...ann, label: className, color: cls ? cls.color : '#34C759' }
          : ann
      )
    );
  }, [selectedAnnId, classes]);

  // Find annotation at canvas coordinates
  const findAnnotationAtCoords = useCallback((x: number, y: number): Annotation | null => {
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
  }, [currentImage, annotations, renderedWidth, renderedHeight]);

  // Canvas mouse handlers
  const getCanvasMouseCoords = useCallback((e: React.MouseEvent, container: HTMLDivElement) => {
    const rect = container.getBoundingClientRect();
    return {
      x: Math.max(0, Math.min(renderedWidth, e.clientX - rect.left)),
      y: Math.max(0, Math.min(renderedHeight, e.clientY - rect.top)),
    };
  }, [renderedWidth, renderedHeight]);

  const handleCanvasMouseDown = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    const container = e.currentTarget;
    const coords = getCanvasMouseCoords(e, container);

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
  }, [canvasMode, getCanvasMouseCoords, findAnnotationAtCoords]);

  const handleCanvasMouseMove = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    const container = e.currentTarget;
    const coords = getCanvasMouseCoords(e, container);

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
        })
      );
    }
  }, [isDrawing, isDragging, draggedAnnId, currentImage, dragStart, dragInitialBox, dragMode, renderedWidth, renderedHeight, getCanvasMouseCoords]);

  const handleCanvasMouseUp = useCallback(() => {
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
  }, [isDrawing, currentImage, drawStart, drawEnd, renderedWidth, renderedHeight, classes, activeClass, annotations.length]);

  const handleStartResize = useCallback((annId: number | string, e: React.MouseEvent, container: HTMLDivElement) => {
    e.stopPropagation();
    const ann = annotations.find(a => a.id === annId);
    if (!ann) return;
    setIsDragging(true);
    setDraggedAnnId(annId);
    setDragStart(getCanvasMouseCoords(e, container));
    setDragInitialBox({ x1: ann.x1, y1: ann.y1, x2: ann.x2, y2: ann.y2 });
    setDragMode('se');
  }, [annotations, getCanvasMouseCoords]);

  return {
    annotations,
    setAnnotations,
    selectedAnnId,
    setSelectedAnnId,
    canvasMode,
    setCanvasMode,
    activeClass,
    setActiveClass,
    isDrawing,
    drawStart,
    drawEnd,
    fetchAnnotations,
    handleSaveAnnotations,
    handleDeleteAnnotation,
    handleChangeSelectedClass,
    handleCanvasMouseDown,
    handleCanvasMouseMove,
    handleCanvasMouseUp,
    handleStartResize,
  };
}
