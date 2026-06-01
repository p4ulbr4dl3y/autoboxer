# План реализации: React Router в Autoboxer

## Контекст

Сейчас навигация в приложении реализована через `useState<'dashboard' | 'project' | 'editor'>` в `App.tsx`. URL не меняется при переключении вкладок — нельзя поделиться ссылкой, не работает кнопка «Назад» в браузере. Нужно внедрить `react-router-dom` с тремя маршрутами.

## Подход

Используем `react-router-dom` v7 (последняя стабильная). Структура роутов:

```
/                                   → Dashboard
/projects/:projectId               → ProjectGallery
/projects/:projectId/images/:imageId → Editor
```

**Ключевое решение**: состояние `useProjects` и `useProjectDetail` остаётся в `App.tsx`, но `App` станет layout-компонентом с `<Outlet>`. Данные будут прокидываться через React Context, чтобы дочерние страницы имели доступ без prop drilling через роутер.

## Шаги

### 1. Установить react-router-dom

- **Файлы**: `frontend/package.json`
- **Что делаем**: `npm install react-router-dom`
- **Почему**: стандартный роутер для React, поддерживает вложенные роуты и layout routes

### 2. BrowserRouter в main.tsx

- **Файлы**: `frontend/src/main.tsx`
- **Что делаем**: Оборачиваем `<App />` в `<BrowserRouter>`
- **Почему**: роутер должен быть на верхнем уровне

### 3. Создать AppContext для передачи данных между layout и страницами

- **Файлы**: `frontend/src/context/AppContext.tsx` (новый)
- **Что делаем**: Создаём контекст с типом:
  ```ts
  interface AppContextType {
    projects: Project[];
    stats: Record<number, ProjectStats>;
    fetchProjects: () => Promise<void>;
    fetchStats: (id: number) => Promise<void>;
    deleteProject: (id: number) => Promise<void>;
    // Project detail
    images: ImageItem[];
    setImages: React.Dispatch<React.SetStateAction<ImageItem[]>>;
    classes: ClassCategory[];
    setClasses: React.Dispatch<React.SetStateAction<ClassCategory[]>>;
    statusFilter: string;
    setStatusFilter: (f: string) => void;
    fetchProjectDetails: (id: number) => Promise<void>;
    fetchProjectImages: (id: number) => Promise<void>;
  }
  ```
- **Почему**:避免 prop drilling через Outlet, страницы могут сами брать нужные данные

### 4. Переписать App.tsx как layout с маршрутами

- **Файлы**: `frontend/src/App.tsx`
- **Что делаем**:
  - Удаляем `useState` для `view`, `selectedProjectId`, `currentImageId`
  - Оставляем хуки `useProjects`, `useProjectDetail`
  - Создаём `AppContext.Provider` с данными
  - Используем `<Routes>`:
    - `<Route element={<AppLayout />}>` — layout с Header и модалками
      - `<Route index element={<DashboardPage />} />`
      - `<Route path="projects/:projectId" element={<ProjectGalleryPage />} />`
      - `<Route path="projects/:projectId/images/:imageId" element={<EditorPage />} />`
  - Логика модалок (delete confirmation, error) остаётся в App.tsx layout
- **Почему**: App.tsx становится чистым layout-контейнером

### 5. Создать AppLayout компонент

- **Файлы**: `frontend/src/layouts/AppLayout.tsx` (новый)
- **Что делаем**: Рендерит `<Header />`, `<Outlet />` и модальные окна (delete, error, unsaved guard)
- **Почему**: Разделение layout и страниц

### 6. Создать страницы-обёртки

- **Файлы**: `frontend/src/pages/DashboardPage.tsx`, `frontend/src/pages/ProjectGalleryPage.tsx`, `frontend/src/pages/EditorPage.tsx` (новые)
- **Что делаем**: Каждая страница берёт данные из `AppContext` и рендерит существующий компонент
  - `DashboardPage`: берёт `projects`, `stats`, рендерит `<Dashboard>`
  - `ProjectGalleryPage`: берёт `projectId` из `useParams()`, загружает детали, рендерит `<ProjectGallery>`
  - `EditorPage`: берёт `imageId` из `useParams()`, рендерит `<Editor>`
- **Почему**: Существующие компоненты остаются почти без изменений

### 7. Обновить Header

- **Файлы**: `frontend/src/components/Header.tsx`
- **Что делаем**:
  - Убираем пропсы `view`, `onNavigate`
  - Используем `useLocation()` для определения текущего маршрута
  - Используем `<Link to="/">` для Dashboard
  - Используем `<Link to="/projects/:id">` для Gallery (берём projectId из URL)
  - Добавляем `useParams()` для получения projectId
- **Почему**: Header должен сам знать текущий маршрут

### 8. Обновить Dashboard

- **Файлы**: `frontend/src/components/Dashboard.tsx`
- **Что делаем**:
  - Убираем пропс `onOpenProject`
  - Используем `useNavigate()` — `navigate(\`/projects/${id}\`)`
- **Почему**: Навигация через URL

### 9. Обновить ProjectGallery

- **Файлы**: `frontend/src/components/ProjectGallery.tsx`
- **Что делаем**:
  - Убираем пропс `onOpenEditor`
  - Используем `useNavigate()` и `useParams()` — `navigate(\`/projects/${projectId}/images/${imageId}\`)`
- **Почему**: Навигация через URL

### 10. Обновить Editor для работы с URL

- **Файлы**: `frontend/src/components/Editor.tsx`
- **Что делаем**:
  - Вместо пропса `currentImageId` берём `imageId` из `useParams()`
  - Вместо `onSaveAndExit` используем `navigate(-1)` или `navigate(\`/projects/${projectId}\`)`
  - Guard несохранённых изменений: перехватываем `useBlocker` из react-router-dom (v7) или `useBeforeUnload`
- **Почему**: Editor должен реагировать на URL

### 11. Сохранить guard несохранённых изменений

- **Файлы**: `frontend/src/App.tsx` или `frontend/src/pages/EditorPage.tsx`
- **Что делаем**:
  - Используем `useBlocker` (react-router-dom v7) для перехвата внутренней навигации
  - Используем `useBeforeUnload` для перехвата закрытия вкладки
  - Модальное окно «Несохранённые изменения» остаётся
- **Почему**: Нельзя терять аннотации без предупреждения

## Технические решения

1. **React Context vs prop drilling**: Используем Context, т.к. данные useProjects/useProjectDetail нужны на нескольких страницах, а роутер не позволяет легко прокидывать пропсы
2. **Сохраняем существующие компоненты**: Dashboard, ProjectGallery, Editor остаются по сути теми же — только меняется способ получения навигации и данных
3. **react-router-dom v7**: Последняя стабильная версия с поддержкой `useBlocker`

## Проверка

- [ ] `npm run build` проходит без ошибок TypeScript
- [ ] Переход по `/` показывает Dashboard
- [ ] Клик по проекту → `/projects/1` → ProjectGallery
- [ ] Клик по изображению → `/projects/1/images/5` → Editor
- [ ] Кнопка «Назад» в браузере работает корректно
- [ ] Прямой переход по URL (deep link) работает
- [ ] Guard несохранённых изменений срабатывает при уходе из Editor
- [ ] Batch labeling polling корректно останавливается при навигации
