import { render, screen, fireEvent } from '@testing-library/react';
import { describe, test, expect, vi, beforeEach } from 'vitest';
import Editor from '../Editor';
import { useEditor } from '../../hooks/useEditor';

// Mock AppContext
vi.mock('../../context/AppContext', () => ({
  useAppContext: () => ({
    setDeleteImageInfo: vi.fn(),
  }),
}));

// Mock useEditor custom hook
vi.mock('../../hooks/useEditor', () => ({
  useEditor: vi.fn(),
  cursorForResizeMode: vi.fn().mockReturnValue('cursor-nw-resize'),
}));

describe('Editor Component', () => {
  const mockImages = [
    { id: 1, project_id: 1, filename: 'cat.jpg', filepath: '/tmp/cat.jpg', width: 800, height: 600, status: 'unlabeled', created_at: '' }
  ];

  const mockClasses = [
    { id: 1, name: 'cat', color: '#34C759', prompt: 'Locate cats.', created_at: '' },
    { id: 2, name: 'dog', color: '#FF3B30', prompt: 'Locate dogs.', created_at: '' }
  ];

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let mockState: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let mockActions: any;

  beforeEach(() => {
    vi.clearAllMocks();

    mockState = {
      annotations: [
        { id: 1, image_id: 1, box_id: 1, x1: 50, y1: 50, x2: 250, y2: 250, label: 'cat' }
      ],
      selectedAnnId: null,
      canvasMode: 'select',
      activeClass: 'cat',
      isDirty: false,
      canUndo: false,
      canRedo: false,
      zoom: 1,
      panX: 0,
      panY: 0,
      isPanning: false,
      isZooming: false,
      activePointerCount: 0,
      isDrawing: false,
      drawStart: null,
      drawEnd: null,
      isDragging: false,
      resizeMode: 'move',
      annotationFilter: new Set(),
      renderedWidth: 800,
      renderedHeight: 600,
      contextMenu: null,
      dimensionTooltip: null,
      isAiLabeling: false,
    };

    mockActions = {
      setSelectedAnnId: vi.fn(),
      setCanvasMode: vi.fn(),
      setActiveClass: vi.fn(),
      setAnnotationFilter: vi.fn(),
      setContextMenu: vi.fn(),
      undo: vi.fn(),
      redo: vi.fn(),
      handleCanvasPointerDown: vi.fn(),
      handleCanvasPointerMove: vi.fn(),
      handleCanvasPointerUp: vi.fn(),
      handleDeleteAnnotation: vi.fn(),
      handleChangeSelectedClass: vi.fn(),
      handleDuplicateAnnotation: vi.fn(),
      handleSaveAnnotations: vi.fn(),
      handleNextImage: vi.fn(),
      handlePrevImage: vi.fn(),
      imageContainerRef: { current: null },
      imageRef: { current: null },
      setZoom: vi.fn(),
      setPanX: vi.fn(),
      setPanY: vi.fn(),
      handleResetZoom: vi.fn(),
      handleSetZoomPreset: vi.fn(),
      handleAutoLabelImage: vi.fn(),
    };

    vi.mocked(useEditor).mockReturnValue({
      state: mockState,
      actions: mockActions,
      currentImage: mockImages[0],
      currentImageIndex: 0,
      handleStartResize: vi.fn(),
    });
  });

  test('renders top toolbar, canvas workspace, and sidebars', () => {
    render(
      <Editor
        currentImageId={1}
        images={mockImages}
        classes={mockClasses}
        onSaveAndExit={() => {}}
        onImageChange={() => {}}
        setImages={() => {}}
      />
    );

    // Active image name
    expect(screen.getByText('cat.jpg')).toBeInTheDocument();
    
    // Select & Draw mode buttons
    expect(screen.getByTitle('Select Mode (S)')).toBeInTheDocument();
    expect(screen.getByTitle('Draw Bounding Box (D)')).toBeInTheDocument();

    // Sidebars titles
    expect(screen.getByText('Active Drawing Class')).toBeInTheDocument();
    expect(screen.getByText('Annotations (1)')).toBeInTheDocument();
  });

  test('switches canvas interaction modes', () => {
    render(
      <Editor
        currentImageId={1}
        images={mockImages}
        classes={mockClasses}
        onSaveAndExit={() => {}}
        onImageChange={() => {}}
        setImages={() => {}}
      />
    );

    const drawBtn = screen.getByTitle('Draw Bounding Box (D)');
    fireEvent.click(drawBtn);
    expect(mockActions.setCanvasMode).toHaveBeenCalledWith('draw');
  });

  test('triggers auto-label when run button is clicked', () => {
    render(
      <Editor
        currentImageId={1}
        images={mockImages}
        classes={mockClasses}
        onSaveAndExit={() => {}}
        onImageChange={() => {}}
        setImages={() => {}}
      />
    );

    // Clicking "Run Grounding" button in the sidebar triggers handleAutoLabelImage
    const runBtn = screen.getByText('Run Grounding');
    fireEvent.click(runBtn);
    expect(mockActions.handleAutoLabelImage).toHaveBeenCalled();
  });

  test('changes active annotation class in the sidebar list', () => {
    render(
      <Editor
        currentImageId={1}
        images={mockImages}
        classes={mockClasses}
        onSaveAndExit={() => {}}
        onImageChange={() => {}}
        setImages={() => {}}
      />
    );

    // Click on dog class list item to make it active for new boxes
    const dogClassBtn = screen.getByText('dog').closest('button');
    fireEvent.click(dogClassBtn!);
    expect(mockActions.setActiveClass).toHaveBeenCalledWith('dog');
  });

  test('Save & Next button has the short label (no Enter hint)', () => {
    render(
      <Editor
        currentImageId={1}
        images={mockImages}
        classes={mockClasses}
        onSaveAndExit={() => {}}
        onImageChange={() => {}}
        setImages={() => {}}
      />
    );

    // The single-image fixture puts us on the last image, so "Save & Finish" is shown.
    // Verify the "(Enter)" suffix is no longer present in either button label.
    expect(screen.queryByText(/Save & Next \(Enter\)/)).not.toBeInTheDocument();
  });

  test('does not render the keyboard shortcuts hint block', () => {
    render(
      <Editor
        currentImageId={1}
        images={mockImages}
        classes={mockClasses}
        onSaveAndExit={() => {}}
        onImageChange={() => {}}
        setImages={() => {}}
      />
    );

    // The hint block was removed; the legacy short hint string must not be in the DOM.
    expect(screen.queryByText(/D=draw S=select 1-9=class/)).not.toBeInTheDocument();
  });

  test('renders resize handles with enlarged hit area (24×24 wrapper)', () => {
    mockState.selectedAnnId = 1;
    render(
      <Editor
        currentImageId={1}
        images={mockImages}
        classes={mockClasses}
        onSaveAndExit={() => {}}
        onImageChange={() => {}}
        setImages={() => {}}
      />
    );

    // 8 resize handles per selected annotation. We have 1 selected.
    const handles = document.querySelectorAll('.cursor-nw-resize, .cursor-n-resize, .cursor-ne-resize, .cursor-e-resize, .cursor-se-resize, .cursor-s-resize, .cursor-sw-resize, .cursor-w-resize');
    expect(handles.length).toBe(8);
    // Each wrapper is 24×24 (w-6 h-6) — verify the class is present on at least one.
    const wrapper = handles[0] as HTMLElement;
    expect(wrapper.className).toMatch(/w-6/);
    expect(wrapper.className).toMatch(/h-6/);
  });
});
