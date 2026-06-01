# Задачи

- [x] 1. Установить `react-router-dom` как зависимость
- [x] 2. Обернуть приложение в `<BrowserRouter>` в `main.tsx`
- [x] 3. Создать layout-роутер с маршрутами `/`, `/projects/:projectId`, `/projects/:projectId/images/:imageId`
- [x] 4. Вынести состояние проектов (useProjects, useProjectDetail) в контекст или оставить в App, но передавать через Outlet-контекст
- [x] 5. Переписать `Header` — использовать `<Link>` / `useNavigate` вместо `onNavigate` callback
- [x] 6. Переписать `Dashboard` — использовать `useNavigate` для перехода в проект
- [x] 7. Переписать `ProjectGallery` — использовать `useNavigate` для перехода в редактор
- [x] 8. Сохранить guard несохранённых изменений в Editor (перехват `beforeunload` и навигации)
- [x] 9. Проверить сборку `npm run build` без ошибок
