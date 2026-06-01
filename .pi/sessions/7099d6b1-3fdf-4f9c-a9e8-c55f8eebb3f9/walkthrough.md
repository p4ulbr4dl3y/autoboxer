# Walkthrough: Project Restructuring

## Summary
Split two monolithic files into a clean, modular architecture.

## Backend Changes

### Before
- `app/main.py` — 500+ lines with ALL endpoints
- Hardcoded absolute paths in `main.py` and `database.py`

### After
- `app/config.py` — centralized paths (`BASE_DIR`, `DATA_DIR`, `DATABASE_FILE`)
- `app/main.py` — ~45 lines: FastAPI setup, CORS, lifespan, router inclusion
- `app/database.py` — uses `config.DATABASE_FILE`
- `app/routers/projects.py` — CRUD projects + stats
- `app/routers/classes.py` — CRUD classes
- `app/routers/images.py` — upload, list, serve files
- `app/routers/annotations.py` — get/update annotations
- `app/routers/labeling.py` — single + batch auto-labeling (shared `_run_labeling_on_image` helper)
- `app/routers/export.py` — YOLO/COCO export with `_export_yolo`, `_export_coco`, `_get_image_dims` helpers
- `app/routers/pipeline.py` — legacy `/label` and `/label-visualize` endpoints

### Dependencies
- Added `python-multipart` to `pyproject.toml` (was missing)
- All existing deps now properly declared via `uv add`

## Frontend Changes

### Before
- `src/App.tsx` — 1888 lines with ALL views, state, handlers, inline components

### After
- `src/types/index.ts` — TypeScript interfaces (Project, ClassCategory, ImageItem, Annotation, ProjectStats)
- `src/api/client.ts` — centralized API client with `api.projects`, `api.classes`, `api.images`, `api.annotations`
- `src/hooks/useProjects.ts` — `useProjects()` + `useProjectDetail()` hooks
- `src/hooks/useEditor.ts` — editor canvas + annotation logic hook
- `src/components/Header.tsx` — navigation bar
- `src/components/Dashboard.tsx` — project cards grid
- `src/components/CreateProjectModal.tsx` — new project form
- `src/components/ProjectGallery.tsx` — image grid + sidebar (upload, classes, batch)
- `src/components/BatchModal.tsx` — batch auto-label settings (standalone)
- `src/components/Editor.tsx` — canvas + thumbnails + inspector sidebar
- `src/App.tsx` — ~100 lines: view routing + hook orchestration

## Files Modified
- `backend/app/config.py` (rewritten)
- `backend/app/database.py` (rewritten)
- `backend/app/main.py` (rewritten)
- `backend/pyproject.toml` (deps added)
- `frontend/src/App.tsx` (rewritten)
- `frontend/src/App.css` (unchanged)
- `frontend/src/index.css` (unchanged)

## Files Created
- `backend/app/routers/__init__.py`
- `backend/app/routers/projects.py`
- `backend/app/routers/classes.py`
- `backend/app/routers/images.py`
- `backend/app/routers/annotations.py`
- `backend/app/routers/labeling.py`
- `backend/app/routers/export.py`
- `backend/app/routers/pipeline.py`
- `frontend/src/types/index.ts`
- `frontend/src/api/client.ts`
- `frontend/src/hooks/useProjects.ts`
- `frontend/src/hooks/useEditor.ts`
- `frontend/src/components/Header.tsx`
- `frontend/src/components/Dashboard.tsx`
- `frontend/src/components/CreateProjectModal.tsx`
- `frontend/src/components/ProjectGallery.tsx`
- `frontend/src/components/BatchModal.tsx`
- `frontend/src/components/Editor.tsx`

## Verification
- Backend: `uv run python -c "from app.main import app"` — 22 routes registered
- Frontend: `npm run build` — clean build, 239KB JS bundle
