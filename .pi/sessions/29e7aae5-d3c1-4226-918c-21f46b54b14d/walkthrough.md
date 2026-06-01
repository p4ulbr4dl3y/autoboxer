# Walkthrough

## Изменённые файлы

- `frontend/src/hooks/useEditor.ts` — полная переработка: все 15 фич, ~830 строк
- `frontend/src/components/Editor.tsx` — полная переработка: презентационный компонент, ~530 строк

## Что было сделано

### 1. Миграция на useEditor hook
Вся логика состояния вынесена из Editor.tsx в useEditor.ts. Editor.tsx стал чисто презентационным компонентом. Хук возвращает `{ state, actions, currentImage, currentImageIndex, handleStartResize }`.

### 2. requestAnimationFrame для drag/resize
`handleCanvasPointerMove` сохраняет событие в ref и обновляет аннотации через `requestAnimationFrame`, предотвращая лишние ре-рендеры на каждом mousemove.

### 3. Undo/Redo
Стек `historyPast` / `historyFuture` (массивы `Annotation[][]`, макс 50 шагов). `pushHistory()` вызывается перед каждым мутационным действием (draw, delete, move, resize, class change, copy, duplicate). Cmd+Z / Cmd+Shift+Z.

### 4. Zoom + Pan
- Колёсико мыши → zoom к курсору (point-based, через пересчёт pan)
- Space + drag → pan (отслеживается через keydown/keyup)
- Кнопки +/- в toolbar для zoom к центру
- Cmd+0 → сброс zoom/pan
- CSS `transform: translate(panX, panY) scale(zoom)` на внутреннем div

### 5. Resize со всех 8 углов/сторон
8 handle-элементов (nw, n, ne, e, se, s, sw, w) на каждом выбранном боксе. `applyResize()` — switch по mode, корректно изменяет x1/y1/x2/y2 с MIN_SIZE=5. Каждый handle имеет свой cursor.

### 6. Горячие клавиши для классов (1–9)
В keydown handler: цифры 1–9 → `setActiveClass(classes[n-1].name)`. В UI — бейджи с номерами на кнопках классов.

### 7. Copy from previous
Кнопка в toolbar. Загружает аннотации предыдущего image через API, создаёт копии с новыми `id` и привязкой к текущему image.

### 8. Auto-advance
Toggle кнопка "AUTO" в toolbar. После создания бокса, если включён — автоматический `handleNextImage()` через setTimeout.

### 9. Opacity slider
Range input (0–100%) в toolbar. Значение `fillOpacity` применяется как alpha в `rgba()` заливке каждого bbox.

### 10. Fit-to-screen
`max-width: 85%`, `max-height: 85%` на контейнере. Изображение рендерится с `max-h-[85vh] max-w-full` для contain-fit.

### 11. Minimap
Маленький превью (140×100px) в правом нижнем углу при zoom > 1.05. Показывает красный прямоугольник видимой области. Клик по minimap → pan к этой области.

### 12. Фильтр аннотаций по классу
Кнопки-фильтры в header sidebar-а аннотаций. Уникальные классы из текущих аннотаций. Клик → toggle фильтра. Пустой набор = показать все.

### 13. Размеры бокса (W×H)
Tooltip с `W × Hpx` в пикселях оригинального изображения, следует за курсором при drawing и resize.

### 14. Touch-поддержка
- `onPointerDown/Move/Up` вместо `onMouseDown/Move/Up` — единый API для мыши и тача
- `touch-action: none` + `setPointerCapture` для корректного захвата
- Pinch-to-zoom через отслеживание двух тачей (`touchstart`/`touchmove`)

### 15. Контекстное меню
`onContextMenu` → кастомное меню: Delete, Duplicate, Change Class (submenu с классами). Click-away закрывает. `e.preventDefault()` для подавления браузерного меню.

## Отклонения от плана

- Minimap threshold установлен на 1.05 вместо точного 1.0 (чтобы не мерцал при небольшом отклонении)
- Кнопки zoom в toolbar делают zoom к центру контейнера, а не к курсору (проще в UX)

## Известные ограничения

- Minimap использует `<img>` — при очень больших изображениях может быть лаг. Можно заменить на canvas thumbnail.
- Глубина undo ограничена 50 шагами (настраивается через `MAX_HISTORY`)
- Копирование с предыдущего изображения копирует все аннотации, без выбора конкретных
