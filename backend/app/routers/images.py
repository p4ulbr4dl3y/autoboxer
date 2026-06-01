import os
import datetime
from fastapi import APIRouter, UploadFile, File, HTTPException, status, Depends
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session
from typing import List, Optional
from PIL import Image

from app.config import DATA_DIR
from app.database import get_db
from app.db_models import Project, ImageModel
from app.models import ImageResponse

router = APIRouter(prefix="/api/v1", tags=["images"])


@router.post("/projects/{project_id}/upload-images", response_model=List[ImageResponse])
async def upload_project_images(
    project_id: int,
    files: List[UploadFile] = File(...),
    db: Session = Depends(get_db)
):
    """Upload multiple images into an annotation project."""
    project = db.query(Project).filter(Project.id == project_id).first()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    project_dir = os.path.join(DATA_DIR, f"project_{project_id}")
    os.makedirs(project_dir, exist_ok=True)

    uploaded_images = []
    for file in files:
        if not file.filename:
            continue

        filename = os.path.basename(file.filename)
        filepath = os.path.join(project_dir, filename)

        # Handle duplicates with timestamp suffix
        if os.path.exists(filepath):
            base, ext = os.path.splitext(filename)
            timestamp = int(datetime.datetime.now().timestamp())
            filename = f"{base}_{timestamp}{ext}"
            filepath = os.path.join(project_dir, filename)

        try:
            with open(filepath, "wb") as buffer:
                import shutil
                shutil.copyfileobj(file.file, buffer)
        except Exception:
            continue

        try:
            with Image.open(filepath) as img:
                width, height = img.size
        except Exception:
            width, height = None, None

        db_image = ImageModel(
            project_id=project_id,
            filename=filename,
            filepath=filepath,
            width=width,
            height=height,
            status="unlabeled"
        )
        db.add(db_image)
        uploaded_images.append(db_image)

    db.commit()
    for img in uploaded_images:
        db.refresh(img)

    return uploaded_images


@router.get("/projects/{project_id}/images", response_model=List[ImageResponse])
def list_project_images(
    project_id: int,
    skip: int = 0,
    limit: int = 100,
    status: Optional[str] = None,
    db: Session = Depends(get_db)
):
    """List images registered under a project with optional status filter."""
    query = db.query(ImageModel).filter(ImageModel.project_id == project_id)
    if status:
        query = query.filter(ImageModel.status == status)
    return query.offset(skip).limit(limit).all()


@router.get("/images/{image_id}/file")
def get_image_file(image_id: int, db: Session = Depends(get_db)):
    """Serve the raw image file from disk by image database ID."""
    db_image = db.query(ImageModel).filter(ImageModel.id == image_id).first()
    if not db_image:
        raise HTTPException(status_code=404, detail="Image not found")

    if not os.path.exists(db_image.filepath):
        raise HTTPException(status_code=404, detail="Image file not found on disk")

    return FileResponse(db_image.filepath)


@router.delete("/images/{image_id}")
def delete_image(image_id: int, db: Session = Depends(get_db)):
    """Delete an image, its database record, its annotations, and its file on disk."""
    db_image = db.query(ImageModel).filter(ImageModel.id == image_id).first()
    if not db_image:
        raise HTTPException(status_code=404, detail="Image not found")

    try:
        if os.path.exists(db_image.filepath):
            os.remove(db_image.filepath)
    except Exception as e:
        print(f"Error removing file {db_image.filepath}: {e}")

    db.delete(db_image)
    db.commit()
    return {"detail": f"Image {image_id} deleted successfully"}
