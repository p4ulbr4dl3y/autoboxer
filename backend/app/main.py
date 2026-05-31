import os
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from contextlib import asynccontextmanager

from app.config import DATA_DIR
from app.database import engine, Base
from app.pipeline import ModelManager

from app.routers import projects, classes, images, annotations, labeling, export, pipeline


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Startup: init DB tables, data dir, pre-warm model. Shutdown: cleanup."""
    print("Initializing SQLite database tables...")
    Base.metadata.create_all(bind=engine)

    os.makedirs(DATA_DIR, exist_ok=True)
    print(f"Data storage directory initialized at: {DATA_DIR}")

    print("Pre-warming LocateAnything model...")
    try:
        ModelManager().get_locate_anything()
        print("LocateAnything model loaded and ready.")
    except Exception as e:
        print(f"Error pre-warming LocateAnything model: {e}")

    yield

    print("Shutting down and cleaning up models...")
    ModelManager()._models.clear()


app = FastAPI(
    title="Locate Anything Auto-Labeling API",
    description="API for automatic bounding box detection, dataset/project management, and annotation storage.",
    version="3.0.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Register routers
app.include_router(projects.router)
app.include_router(classes.router)
app.include_router(images.router)
app.include_router(annotations.router)
app.include_router(labeling.router)
app.include_router(export.router)
app.include_router(pipeline.router)


@app.get("/")
def read_root():
    return {
        "status": "online",
        "message": "Welcome to Locate Anything Auto-Labeling API. Use /docs for API documentation.",
    }
