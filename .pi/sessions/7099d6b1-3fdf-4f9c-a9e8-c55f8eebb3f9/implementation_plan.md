# Implementation Plan: Project Restructuring

## Problem
- `backend/app/main.py` — 500+ lines with ALL endpoints (projects, classes, images, annotations, batch labeling, export, legacy pipeline)
- `frontend/src/App.tsx` — 1888 lines with ALL views, state, handlers, and inline components
- Hardcoded absolute paths in backend

## Backend Plan

### 1. Config (`backend/app/config.py`)
Move hardcoded paths here:
```python
BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA_DIR = os.path.join(BASE_DIR, "data")
DATABASE_FILE = os.path.join(BASE_DIR, "autoboxer.db")
```

### 2. Router Split (`backend/app/routers/`)
Create `__init__.py` + 6 router files:

| Router | Endpoints | ~Lines |
|--------|-----------|--------|
| `projects.py` | CRUD projects, stats | ~80 |
| `classes.py` | CRUD classes | ~50 |
| `images.py` | upload, list, serve files | ~80 |
| `annotations.py` | get/update annotations | ~60 |
| `labeling.py` | single image auto-label, batch auto-label | ~200 |
| `export.py` | YOLO/COCO export | ~120 |
| `pipeline.py` | legacy /label and /label-visualize | ~80 |

### 3. Slim `backend/app/main.py`
Only: FastAPI setup, CORS, lifespan, router inclusion (~40 lines)

### 4. `database.py`
Use `config.DATABASE_FILE` instead of hardcoded path.

## Frontend Plan

### 1. Types (`src/types/index.ts`)
All interfaces: Project, ClassCategory, ImageItem, Annotation, ProjectStats

### 2. API Client (`src/api/client.ts`)
Single `api` object with methods like `api.projects.list()`, `api.images.upload()`, etc.
Centralizes `API_URL` and fetch logic.

### 3. Custom Hooks
- `useProjects()` — projects list, stats, CRUD, polling
- `useEditor()` — canvas state, annotations, drawing/dragging, save/navigate

### 4. Components
| Component | Responsibility |
|-----------|---------------|
| `Header.tsx` | Top navigation bar |
| `Dashboard.tsx` | Project cards grid + create modal |
| `CreateProjectModal.tsx` | New project form |
| `ProjectGallery.tsx` | Image grid + sidebar (upload, classes, batch) |
| `BatchModal.tsx` | Batch auto-label settings |
| `Editor.tsx` | Canvas + left thumbnails + right inspector |

### 5. Slim `App.tsx`
View routing + hook calls (~80 lines)

## Verification
- `cd backend && uv run main.py` — server starts, no import errors
- `cd frontend && npm run build` — TypeScript compilation passes
