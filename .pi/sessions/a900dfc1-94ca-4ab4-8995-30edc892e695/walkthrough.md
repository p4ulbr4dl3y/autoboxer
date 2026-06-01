# Walkthrough: Внедрение React Router

## Изменённые файлы

| Файл | Статус |
|---|---|
| `frontend/package.json` | Добавлен `react-router-dom` |
| `frontend/src/main.tsx` | Обёрнут в `<BrowserRouter>` |
| `frontend/src/context/AppContext.tsx` | **Новый** — контекст для передачи состояния между layout и страницами |
| `frontend/src/layouts/AppLayout.tsx` | **Новый** — layout с Header и `<Outlet>` |
| `frontend/src/pages/DashboardPage.tsx` | **Новый** — страница Dashboard |
| `frontend/src/pages/ProjectGalleryPage.tsx` | **Новый** — страница галереи проекта |
| `frontend/src/pages/EditorPage.tsx` | **Новый** — страница редактора с guard несохранённых изменений |
| `frontend/src/App.tsx` | Переписан — Routes + Context Provider + глобальные модалки |
| `frontend/src/components/Header.tsx` | `<Link>` вместо `onNavigate` callback |

## Что сделано

1. **Установлен `react-router-dom`** (v7)
2. **BrowserRouter** обёртка в `main.tsx`
3. **Маршруты**:
   - `/` → Dashboard
   - `/projects/:projectId` → ProjectGallery
   - `/projects/:projectId/images/:imageId` → Editor
4. **AppContext** — передаёт projects, stats, images, classes, модальные состояния и batch labeling логику между layout и страницами
5. **AppLayout** — Header + `<Outlet>`, определяет текущий view из URL
6. **Header** — использует `<Link>` для навигации, `selectedProjectId` из URL
7. **Dashboard** — `useNavigate` для перехода в проект
8. **ProjectGallery** — `useNavigate` для перехода в редактор
9. **Editor** — `useParams` для imageId, `useBlocker` для guard несохранённых изменений
10. **Глобальные модалки** (delete project, delete class, error) остались в App.tsx

## Навигация

- Клик по проекту → `/projects/1`
- Клик по изображению → `/projects/1/images/5`
- Кнопка «Назад» в браузере работает
- Deep link (прямой переход по URL) работает
- Guard: при уходе из Editor с несохранёнными изменениями — модальное окно

## Известные ограничения

- `useProjectDetail(null)` инициализируется в App.tsx, но загрузка деталей проекта происходит в `ProjectGalleryPage` и `EditorPage` при монтировании. Это нормально — данные загружются по URL-параметрам.
- Batch labeling polling использует `currentProjectIdRef` для остановки при навигации — работает как раньше.
