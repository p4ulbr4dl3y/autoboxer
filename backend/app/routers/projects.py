import os
import shutil
from fastapi import APIRouter, HTTPException, status, Depends
from sqlalchemy.orm import Session
from typing import List

from app.config import DATA_DIR
from app.database import get_db
from app.db_models import Project, ClassModel, ImageModel
from app.models import ProjectCreate, ProjectResponse

router = APIRouter(prefix="/api/v1/projects", tags=["projects"])


@router.post("", response_model=ProjectResponse, status_code=status.HTTP_201_CREATED)
def create_project(project: ProjectCreate, db: Session = Depends(get_db)):
    """Create a new annotation project/dataset."""
    db_project = db.query(Project).filter(Project.name == project.name).first()
    if db_project:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Project with this name already exists"
        )

    new_project = Project(
        name=project.name,
        description=project.description,
        default_prompt=project.default_prompt
    )
    db.add(new_project)
    db.commit()
    db.refresh(new_project)

    # Save initial project classes if provided
    colors = ["#34C759", "#007AFF", "#FF9500", "#FF3B30", "#AF52DE", "#5AC8FA"]
    if project.classes:
        for idx, cls_create in enumerate(project.classes):
            color = cls_create.color if cls_create.color else colors[idx % len(colors)]
            prompt = cls_create.prompt if cls_create.prompt else f"Locate {cls_create.name.strip()}."
            new_class = ClassModel(
                project_id=new_project.id,
                name=cls_create.name.strip(),
                color=color,
                prompt=prompt
            )
            db.add(new_class)
        db.commit()
        db.refresh(new_project)

    return new_project


@router.get("", response_model=List[ProjectResponse])
def list_projects(skip: int = 0, limit: int = 100, db: Session = Depends(get_db)):
    """List all annotation projects."""
    return db.query(Project).offset(skip).limit(limit).all()


@router.get("/{project_id}", response_model=ProjectResponse)
def get_project(project_id: int, db: Session = Depends(get_db)):
    """Get project details by ID."""
    project = db.query(Project).filter(Project.id == project_id).first()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    return project


@router.delete("/{project_id}")
def delete_project(project_id: int, db: Session = Depends(get_db)):
    """Delete a project and all associated image files and annotations."""
    project = db.query(Project).filter(Project.id == project_id).first()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    # Remove files from disk
    project_dir = os.path.join(DATA_DIR, f"project_{project_id}")
    if os.path.exists(project_dir):
        shutil.rmtree(project_dir, ignore_errors=True)

    db.delete(project)
    db.commit()
    return {"detail": "Project deleted successfully"}


@router.get("/{project_id}/stats")
def get_project_stats(project_id: int, db: Session = Depends(get_db)):
    """Retrieve labeling progress and statistics for the project."""
    project = db.query(Project).filter(Project.id == project_id).first()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    total = db.query(ImageModel).filter(ImageModel.project_id == project_id).count()
    unlabeled = db.query(ImageModel).filter(ImageModel.project_id == project_id, ImageModel.status == "unlabeled").count()
    labeled = db.query(ImageModel).filter(ImageModel.project_id == project_id, ImageModel.status == "labeled").count()
    in_progress = db.query(ImageModel).filter(ImageModel.project_id == project_id, ImageModel.status == "in_progress").count()

    return {
        "project_id": project_id,
        "name": project.name,
        "total_images": total,
        "unlabeled_images": unlabeled,
        "labeled_images": labeled,
        "in_progress_images": in_progress,
        "batch_in_progress": project.batch_in_progress
    }
