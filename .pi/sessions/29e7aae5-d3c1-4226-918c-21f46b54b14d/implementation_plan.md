# План реализации

## Контекст

Масштабное улучшение редактора аннотаций (Editor.tsx): 15 фич для UX, эффективности и качества кода. Основной файл — `frontend/src/components/Editor.tsx` (~450 строк). Также есть неиспользуемый `frontend/src/hooks/useEditor.ts`.

## Подход

Работаем в одном файле `Editor.tsx`, постепенно добавляя фичи. Хук `useEditor.ts` будет переписан под новую архитектуру (zoom/pan/undo state). Каждая фича — отдельный шаг с проверкой.

---

## Шаги

### 1. Миграция на useEditor hook
- **Файлы**: `frontend/src/hooks/useEditor.ts`, `frontend/src/components/Editor.tsx`
- **Что делаем**: Переносим все useState и логику из Editor.tsx в useEditor. Editor.tsx остаётся только JSX + вызовы хука.
- **Почему**: Разделение логики и presentation. Editor.tsx сейчас ~450 строк, станет ~200.

### 2. requestAnimationFrame для drag/resize
- **Файлы**: `frontend/src/hooks/useEditor.ts`
- **Что делаем**: В `handleCanvasMouseMove` обновляем annotations через `requestAnimationFrame`. Используем ref для промежуточных координат.
- **Почему**: Плавность при drag/resize, особенно на 60fps дисплеях.

### 3. Undo/Redo
- **Файлы**: `frontend/src/hooks/useEditor.ts`
- **Что делаем**: Стек истории (`past: Annotation[][]`, `future: Annotation[][]`). Каждое изменение (draw, delete, move, resize, class change) пушится в past. Cmd+Z откатывает, Cmd+Shift+Z возвращает.
- **Ограничение**: Глубина истории — 50 шагов.
- **Почему**: Единственная страховка от ошибок.

### 4. Zoom + Pan
- **Файлы**: `frontend/src/hooks/useEditor.ts`, `frontend/src/components/Editor.tsx`
- **Что делаем**:
  - Состояние: `zoom: number` (1..5), `panX/panY: number`
  - Колёсико мыши → zoom к курсору (point-based zoom)
  - Space + drag → pan
  - Ctrl+0 → сброс zoom
  - CSS transform: `scale(zoom) translate(panX, panY)` на image container
  - Все координатные пересчёты (canvas→image) учитывают zoom/pan
- **Почему**: Без zoom невозможно точно размечать мелкие объекты.

### 5. Resize со всех 8 углов и сторон
- **Файлы**: `frontend/src/hooks/useEditor.ts`, `frontend/src/components/Editor.tsx`
- **Что делаем**: 8 handle-элементов (nw, n, ne, e, se, s, sw, w). Каждый handle задаёт свой `dragMode`. В mouse move — логика изменения x1/y1/x2/y2 в зависимости от mode.
- **Почему**: Сейчас только SE-угол. Стандарт любого bbox-редактора.

### 6. Горячие клавиши для классов (1–9)
- **Файлы**: `frontend/src/hooks/useEditor.ts`
- **Что делаем**: В keydown handler: цифры 1–9 → `setActiveClass(classes[n-1].name)`. Показываем номер класса в UI (бейдж на кнопке).
- **Почему**: В разы быстрее мыши.

### 7. Копирование аннотаций с предыдущего изображения
- **Файлы**: `frontend/src/hooks/useEditor.ts`, `frontend/src/components/Editor.tsx`
- **Что делаем**: Кнопка «Copy from prev» в toolbar/sidebar. Загружает аннотации предыдущего image и копирует их (с новыми id). Если текущее уже имеет аннотации — подтверждение.
- **Почему**: Ускоряет разметку серий похожих кадров.

### 8. Auto-advance после рисования
- **Файлы**: `frontend/src/hooks/useEditor.ts`
- **Что делаем**: Флаг `autoAdvance: boolean` (по умолчанию false). После `handleCanvasMouseUp` в draw mode — если флаг включён, автоматически `handleNextImage()`.
- **Почему**: Опциональное ускорение сплошной разметки.

### 9. Ползунок непрозрачности заливки
- **Файлы**: `frontend/src/components/Editor.tsx`
- **Что делаем**: Range input (0–100%) в toolbar. Значение хранится в state `fillOpacity`. Применяется как alpha в `backgroundColor` каждого bbox overlay.
- **Почему**: Гибкость — видеть объект под боксом или затемнять фон.

### 10. Fit-to-screen contain
- **Файлы**: `frontend/src/components/Editor.tsx`
- **Что делаем**: Вместо `max-h-[85%] max-w-[85%]` — вычисляем размер контейнера и масштабируем изображение с `object-fit: contain`, но через JS для точного контроля.
- **Почему**: Изображения разных пропорций занимают неоптимальное место.

### 11. Миникарта (minimap)
- **Файлы**: `frontend/src/components/Editor.tsx`
- **Что делаем**: Маленький превью (120x90px) в углу canvas, видимое только при zoom > 1x. Показывает красный прямоугольник — видимую область. Клик по minimap → pan к этой области.
- **Почему**: Ориентация при zoom.

### 12. Фильтрация аннотаций по классу
- **Файлы**: `frontend/src/components/Editor.tsx`
- **Что делаем**: Dropdown/multiselect в header sidebar-а аннотаций. Фильтрует отображаемый список (не удаляет).
- **Почему**: Удобство при большом количестве классов/аннотаций.

### 13. Показ размеров бокса
- **Файлы**: `frontend/src/components/Editor.tsx`
- **Что делаем**: При drawing/resize — tooltip рядом с курсором, показывающий `W×H` в пикселях оригинального изображения.
- **Почему**: Контроль качества разметки.

### 14. Touch-поддержка (Pointer Events)
- **Файлы**: `frontend/src/hooks/useEditor.ts`, `frontend/src/components/Editor.tsx`
- **Что делаем**: Заменяем `onMouseDown/Move/Up` на `onPointerDown/Move/Up`. Добавляем `touch-action: none` на canvas. Pinch-to-zoom через `pointerId` tracking.
- **Почему**: Поддержка iPad/touchscreen.

### 15. Контекстное меню
- **Файлы**: `frontend/src/components/Editor.tsx`
- **Что делаем**: `onContextMenu` → показываем кастомное меню: Delete, Change class (submenu), Duplicate. Позиционирование по координатам клика.
- **Почему**: Привычный паттерн, ускоряет workflow.

---

## Технические решения

1. **Zoom реализуем через CSS transform** на image container — проще и performant, чем перерисовка canvas.
2. **Undo через immutable snapshot** — при каждом изменении `[...annotations]` в history stack. Просто и надёжно.
3. **8-corner resize** — через enum `ResizeMode: 'nw'|'n'|'ne'|'e'|'se'|'s'|'sw'|'w'|'move'` с switch в mouse move handler.
4. **Pointer Events** вместо mouse+touch — единый API, проще код.
5. **Миникарта** — рендерим уменьшенную копию изображения + overlay с viewport rect.

## Проверка

- [ ] `npm run build` проходит без ошибок
- [ ] Zoom работает колёсиком, pan — space+drag
- [ ] Undo/Redo работает на всех операциях
- [ ] Все 8 resize handle работают корректно
- [ ] Горячие клавиши 1-9 переключают классы
- [ ] Copy from prev работает
- [ ] Auto-advance toggle работает
- [ ] Opacity slider меняет прозрачность заливки
- [ ] Minimap появляется при zoom > 1x
- [ ] Фильтр аннотаций работает
- [ ] Размеры бокса показываются при draw/resize
- [ ] Touch-события работают (если есть устройство)
- [ ] Контекстное меню работает по right-click
