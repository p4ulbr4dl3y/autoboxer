# Autoboxer Agent Workspace

This workspace contains **Autoboxer**, an AI-assisted visual grounding and object-detection image labeling platform built for Apple Silicon.

## Architecture

- **Backend**: FastAPI web server wrapping the MLX mixed 4/8-bit quant of LocateAnything-3B (`mlx-community/LocateAnything-3B-4bit`). Handles sequential grounding class-by-class, image storage, SQLite state management, and dataset exports (YOLO / COCO).
- **Frontend**: React + TypeScript + Vite + Tailwind CSS dark-mode dashboard and single-image bounding-box annotator.

## Project Structure

### Backend (`backend/app/`)
```
app/
├── config.py           # Paths (BASE_DIR, DATA_DIR, DATABASE_FILE) and model config
├── main.py             # FastAPI app setup, CORS, lifespan, router registration
├── database.py         # SQLAlchemy engine, session factory, get_db dependency
├── db_models.py        # ORM models: Project, ClassModel, ImageModel, Annotation
├── models.py           # Pydantic schemas for request/response validation
├── pipeline.py         # ModelManager singleton + run_pipeline inference logic
├── utils.py            # visualize_predictions helper (PIL drawing)
└── routers/
    ├── projects.py     # CRUD projects, stats
    ├── classes.py      # CRUD class categories
    ├── images.py       # Image upload, list, serve files
    ├── annotations.py  # Get/update annotations per image
    ├── labeling.py     # Single-image and batch auto-labeling
    ├── export.py       # YOLO and COCO dataset export
    └── pipeline.py     # Legacy /label and /label-visualize endpoints
```

### Frontend (`frontend/src/`)
```
src/
├── App.tsx             # View router + hook orchestration (~100 lines)
├── types/index.ts      # TypeScript interfaces (Project, ClassCategory, ImageItem, Annotation, ProjectStats)
├── api/client.ts       # Centralized API client (api.projects, api.classes, api.images, api.annotations)
├── hooks/
│   ├── useProjects.ts  # Project list, stats, CRUD logic
│   └── useEditor.ts    # Editor canvas + annotation state (available for future use)
└── components/
    ├── Header.tsx           # Top navigation bar
    ├── Dashboard.tsx        # Project cards grid
    ├── CreateProjectModal.tsx # New project form with class/prompt editor
    ├── ProjectGallery.tsx   # Image grid, upload, class manager, batch labeling
    ├── BatchModal.tsx       # Batch auto-label settings modal
    └── Editor.tsx           # Canvas annotator + thumbnails + AI inspector sidebar
```

## Custom Class Prompts Feature
Each label class category maintains its own distinct visual grounding prompt (e.g. `Locate cat.`, `Locate dog.`). The backend executes these queries sequentially class-by-class, resolving grounding coordinates without semantic ambiguity. Prompts are editable:
1. At project initialization (using an interactive list editor).
2. Inside the gallery sidebar (via auto-saving input fields).

## How to Run

### 1. Backend (FastAPI + MLX)
The backend uses Python and `uv` for package/runtime management.
```bash
cd backend
# Run server (default port 8000)
uv run main.py
```
*Note: LocateAnything-3B-4bit runs locally on Apple Silicon via MLX.*

### mlx-vlm Dependency
LocateAnything support is **not yet in a released `mlx-vlm`**. The project depends on a
fork with the `locateanything` model implementation:
```toml
# backend/pyproject.toml
mlx-vlm = { git = "https://github.com/beshkenadze/mlx-vlm", branch = "feat/locateanything-3b" }
```
The backend will fail to load the model without this fork. Do **not** override it with the
stock `mlx-vlm` from PyPI.

### 2. Frontend (React + Vite)
```bash
cd frontend
# Install dependencies
npm install
# Run development server (default port 5173)
npm run dev
```

## Git Commit Rules
This workspace uses **Conventional Commits** for version control. Commits should follow the format: `<type>: <description>` where `<type>` can be:
- `feat`: New feature or capability (e.g., `feat: add class-specific prompts support`)
- `fix`: Bug fix (e.g., `fix: resolve bounding box rendering offset`)
- `chore`: Refactoring, dependencies, configurations (e.g., `chore: update database models`)
- `docs`: Documentation updates (e.g., `docs: update setup instructions in AGENTS.md`)
