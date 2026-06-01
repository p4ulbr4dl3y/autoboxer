from fastapi import APIRouter, HTTPException, status, Depends
from sqlalchemy.orm import Session

from app.database import get_db
from app.db_models import Project, ClassModel, ImageModel, Annotation
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


@router.delete("/classes/{class_id}")
def delete_class(class_id: int, db: Session = Depends(get_db)):
    """Delete a class and mark affected images as unlabeled."""
    db_class = db.query(ClassModel).filter(ClassModel.id == class_id).first()
    if not db_class:
        raise HTTPException(status_code=404, detail="Class category not found")

    project_id = db_class.project_id
    class_name = db_class.name

    # Find images IN THIS PROJECT that carry annotations with this class label.
    # Scoping by image -> project is essential: annotations are keyed only by
    # label, so deleting globally would wipe identically-named classes in other
    # projects.
    affected_image_ids = [
        row[0] for row in (
            db.query(Annotation.image_id)
            .join(ImageModel, Annotation.image_id == ImageModel.id)
            .filter(ImageModel.project_id == project_id, Annotation.label == class_name)
            .distinct()
            .all()
        )
    ]

    # Delete only this project's annotations for the class.
    if affected_image_ids:
        db.query(Annotation).filter(
            Annotation.image_id.in_(affected_image_ids),
            Annotation.label == class_name,
        ).delete(synchronize_session="fetch")

    # Re-evaluate each affected image: it stays 'labeled' if other annotations
    # remain, and only becomes 'unlabeled' once it has none.
    for img_id in affected_image_ids:
        remaining = db.query(Annotation).filter(Annotation.image_id == img_id).count()
        db.query(ImageModel).filter(ImageModel.id == img_id).update(
            {ImageModel.status: "labeled" if remaining > 0 else "unlabeled"},
            synchronize_session=False,
        )

    db.delete(db_class)
    db.commit()
    return {"detail": "Class deleted", "affected_images": len(affected_image_ids)}
