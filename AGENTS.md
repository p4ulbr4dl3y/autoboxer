# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

Autoboxer is a local AI-assisted object-detection labeling tool for Apple Silicon. A FastAPI backend wraps the MLX 4-bit quant of LocateAnything-3B (`mlx-community/LocateAnything-3B-4bit`) to auto-generate bounding boxes; a React/Vite frontend provides the dashboard, gallery, and bounding-box editor.

## Commands

Run both services together: `./start.sh` (backend on :8000, frontend on :5173).

Backend (run from `backend/`, uses `uv`):
- `uv run main.py` — start API server (uvicorn, reloads on `app/` changes)
- `uv run python -m pytest` — run all tests (use `pytest path::test_name` for one)
- `uv run ruff check` / `uv run ruff format` — lint / format

Frontend (run from `frontend/`):
- `npm run dev` — Vite dev server
- `npm run build` — `tsc -b && vite build`
- `npm run lint` — ESLint
- `npx vitest run` — unit/component tests (jsdom); `npx vitest run src/components/__tests__/Editor.test.tsx` for one
- `npx playwright install && npx playwright test` — E2E (`frontend/e2e/`); spins up its own dev server

## Critical: mlx-vlm fork dependency

LocateAnything is **not** in released `mlx-vlm`. `backend/pyproject.toml` pins a fork via `[tool.uv.sources]` (`git = "https://github.com/beshkenadze/mlx-vlm", rev = "feat/locateanything-3b"`). The model load fails without it — never replace it with PyPI `mlx-vlm`.

## Architecture

### Backend (`backend/app/`)
FastAPI app (`app/main.py`) with a `lifespan` that creates SQLite tables, ensures `DATA_DIR`, and **pre-warms the model** on startup. Routers are mounted under `/api/v1` (except the legacy `pipeline.py` `/label*` endpoints). SQLite DB and uploaded images live in `backend/` (`autoboxer.db`, `data/`); paths come from `app/config.py`.

- `pipeline.py` — `ModelManager` is a thread-safe **singleton** that lazy-loads model/processor once and caches them. `run_pipeline(image_path, prompt)` runs one grounding query, parses the model's `<ref>...</ref><box><x1><y1><x2><y2></box>` text output via regex, and rescales the 0–1000 normalized coords to pixels.
- `routers/labeling.py` — the core flow. `_run_labeling_on_image` is shared by single-image (`POST /images/{id}/auto-label`) and batch (`POST /projects/{id}/auto-label-all`, runs as a `BackgroundTasks` job). Key behaviors:
  - **One model call per class.** When no manual prompt is given, it loops over each target class and runs that class's own `prompt` (falling back to `Locate {name}.`). This sequential class-by-class grounding is the central design choice — it avoids label ambiguity.
  - `mode="overwrite"` deletes that class's existing annotations first; otherwise appends. `box_id`s are re-indexed to stay contiguous.
  - Image `status` cycles `unlabeled` → `in_progress` → `labeled`/`unlabeled`. Batch jobs set/clear `project.batch_in_progress`, which the frontend polls.
- Data model (`db_models.py`): `Project` → `ClassModel` (each with own `color` + grounding `prompt`) and `ImageModel` → `Annotation` (pixel `x1,y1,x2,y2` + `label`). Cascades delete children.

### Frontend (`frontend/src/`)
React 19 + react-router-dom 7 + Tailwind 4. Routing is defined in `main.tsx` via `createBrowserRouter`:
`App` (global modals + shared state) → `AppLayout` → pages `DashboardPage` / `ProjectGalleryPage` / `EditorPage` (`projects/:projectId/images/:imageId`).

- Shared state flows through `context/AppContext.tsx` (provided in `App.tsx`), not prop drilling — projects, images, classes, stats, and the global delete/error `ConfirmModal`s all live there.
- `api/client.ts` — single typed `api` object; all calls hit `http://localhost:8000`. Types in `types/`.
- `hooks/` (`useProjects`, `useEditor`) hold list/CRUD and canvas state. `components/` are presentational (`Editor`, `ProjectGallery`, `Dashboard`, modals).

> Note: `AGENTS.md` describes an older flat `App.tsx`-as-router layout. The live structure (above) uses `pages/`, `layouts/`, and `context/` — trust the code.

## Conventions

- Commits follow **Conventional Commits**: `feat:`, `fix:`, `chore:`, `docs:`.
- Backend tests use a separate SQLite file and **mock the MLX model** via `tests/conftest.py` fixtures — never load the real model in tests.
