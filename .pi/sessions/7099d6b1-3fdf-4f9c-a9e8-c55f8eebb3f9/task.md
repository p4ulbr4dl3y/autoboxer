# Task: Restructure Autoboxer for Maintainability

## Backend Tasks
- [x] 1. Split `backend/app/main.py` (~500 lines, all endpoints) into router modules
- [x] 2. Move hardcoded paths from `main.py` and `database.py` into `config.py`
- [x] 3. Create `backend/app/routers/` directory with: `projects.py`, `classes.py`, `images.py`, `annotations.py`, `labeling.py`, `export.py`, `pipeline.py`
- [x] 4. Wire routers into a slim `app/main.py` that only does app setup + router inclusion
- [x] 5. Verify backend still runs after restructuring

## Frontend Tasks
- [x] 6. Extract TypeScript interfaces from `App.tsx` into `src/types/index.ts`
- [x] 7. Create `src/api/client.ts` — centralized API service layer
- [x] 8. Create `src/hooks/useProjects.ts` — project state + CRUD logic
- [x] 9. Create `src/hooks/useEditor.ts` — editor canvas + annotation logic
- [x] 10. Extract `src/components/Header.tsx`
- [x] 11. Extract `src/components/Dashboard.tsx` + `CreateProjectModal.tsx`
- [x] 12. Extract `src/components/ProjectGallery.tsx` + `BatchModal.tsx`
- [x] 13. Extract `src/components/Editor.tsx` (canvas + sidebars)
- [x] 14. Slim down `App.tsx` to orchestrator (~100 lines)
- [x] 15. Verify frontend builds cleanly
