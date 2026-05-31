from fastapi import APIRouter, HTTPException, status, Depends
from sqlalchemy.orm import Session

from app.database import get_db
from app.db_models import Project, ClassModel
from app.models import ClassCreate, ClassUpdate, ClassResponse

router = APIRouter(prefix="/api/v1", tags=["classes"])


@router.post("/projects/{project_id}/classes", response_model=ClassResponse, status_code=status.HTTP_201_CREATED)
def create_project_class(project_id: int, project_class: ClassCreate, db: Session = Depends(get_db)):
    """Add a custom annotation class category to a project."""
    project = db.query(Project).filter(Project.id == project_id).first()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    existing = db.query(ClassModel).filter(
        ClassModel.project_id == project_id,
        ClassModel.name == project_class.name
    ).first()
    if existing:
        raise HTTPException(status_code=400, detail="Class category already exists in this project")

    prompt = project_class.prompt if project_class.prompt else f"Locate {project_class.name}."
    new_class = ClassModel(
        project_id=project_id,
        name=project_class.name,
        color=project_class.color,
        prompt=prompt
    )
    db.add(new_class)
    db.commit()
    db.refresh(new_class)
    return new_class


@router.put("/classes/{class_id}", response_model=ClassResponse)
def update_class(class_id: int, class_update: ClassUpdate, db: Session = Depends(get_db)):
    """Update class name, color, or locating prompt."""
    db_class = db.query(ClassModel).filter(ClassModel.id == class_id).first()
    if not db_class:
        raise HTTPException(status_code=404, detail="Class category not found")

    if class_update.name is not None:
        db_class.name = class_update.name.strip()
    if class_update.color is not None:
        db_class.color = class_update.color
    if class_update.prompt is not None:
        db_class.prompt = class_update.prompt

    db.commit()
    db.refresh(db_class)
    return db_class
