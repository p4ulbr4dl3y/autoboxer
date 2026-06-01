# Autoboxer

Local AI-assisted visual grounding and object-detection labeling.

![Autoboxer Demo](demo.gif)

Autoboxer automates image annotation using a local visual grounding model (such as NVIDIA's LocateAnything-3B). It turns weeks of manual bounding box annotation into a fast, local workflow.

## Prerequisites

- Python 3.10+ (managed via uv)
- Node.js 18+ and npm

## Getting Started

### Quick Start

Run both frontend and backend services with a single command:

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