# Autoboxer

Local, AI-assisted bounding-box labeling for computer-vision datasets.

![Autoboxer Demo](demo.gif)

Data labeling is the most expensive and slowest link in computer-vision projects. Drawing boxes by hand across thousands of images takes weeks and costs tens of thousands of dollars.

Autoboxer automates that work with a specialized vision-language model, NVIDIA's LocateAnything-3B. Trained on 12 million images and 785 million bounding boxes, the model locates the coordinates of any object on an image from a plain text description. Where a person spends 30 seconds per image, the model does it in a fraction of a second — turning a labeling cycle that used to take weeks into a single working day.

Everything runs locally; no images leave your machine.

## Features

- **Batch labeling** — annotate entire datasets unattended, one model call per class to avoid label ambiguity.
- **Interactive canvas editor** — review and correct boxes by hand when you need to.
- **Export to YOLO and COCO** — drop the result straight into your training pipeline.
- **Project organization** — group work into projects with per-class colors and grounding prompts.

## Prerequisites

- Python 3.13+ (managed via uv)
- Node.js 18+ and npm

## Getting Started

### Quick Start

Run both frontend and backend with a single command:

```bash
chmod +x start.sh
./start.sh
```

This launches the backend on `http://localhost:8000` and the frontend on `http://localhost:5173`.

### Manual Launch

If you prefer to start the services separately:

**Backend**
```bash
cd backend
uv run main.py
```

**Frontend**
```bash
cd frontend
npm install
npm run dev
```
