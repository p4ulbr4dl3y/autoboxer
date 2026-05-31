# Autoboxer: Model-Assisted Image Labeling Studio

This repository contains the backend and frontend for **Autoboxer**, a full-featured web application designed for automatic and manual bounding box labeling, object segmentation, and target classification using Locate Anything, SAM3, and SigLIP2.

---

## 📂 Repository Structure

- [backend/](file:///Users/yegor/autoboxer/backend): FastAPI service managing the SQLite database, custom classes, image file uploads, background batch annotations, and YOLO/COCO dataset exports.
- [frontend/](file:///Users/yegor/autoboxer/frontend): React, TypeScript, and Tailwind CSS v4 single-page application (SPA) containing the interactive gallery dashboard and annotation editor canvas.

---

## 🚀 Getting Started

### 1. Start the Backend API
First, start the FastAPI server in the `backend` folder:

```bash
cd backend
uv run main.py
```

- API Base: `http://localhost:8000`
- Swagger Docs: `http://localhost:8000/docs`

### 2. Start the Frontend Client
In a new terminal window, start the React dev server in the `frontend` folder:

```bash
cd frontend
npm run dev
```

- Web Client Base: `http://localhost:5173` (or the address printed in the dev console).

---

## 🎨 Features & Capabilities

- **Project Galleries**: Organizes annotations by project/datasets.
- **AI Auto-Labeling**: Integrates Locate Anything + SAM3 + SigLIP2/FAISS vector classification.
- **Background Queues**: Annotate entire directories of images concurrently without freezing the UI.
- **Interactive Canvas**: Drag-and-resize bounding boxes, select classes, and preview SAM3 boundaries in real time.
- **Format Export**: Direct ZIP download of labeled datasets in standard YOLO or COCO JSON formats.
