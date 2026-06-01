from fastapi import APIRouter, HTTPException, Depends
from sqlalchemy.orm import Session
from typing import List

from app.database import get_db
from app.db_models import ImageModel, Annotation
from app.models import AnnotationCreate, AnnotationResponse

router = APIRouter(prefix="/api/v1/images/{image_id}/annotations", tags=["annotations"])


@router.get("", response_model=List[AnnotationResponse])
def get_image_annotations(image_id: int, db: Session = Depends(get_db)):
    """Retrieve saved bounding boxes and classes for an image."""
    db_image = db.query(ImageModel).filter(ImageModel.id == image_id).first()
    if not db_image:
        raise HTTPException(status_code=404, detail="Image not found")
    return db_image.annotations


@router.put("", response_model=List[AnnotationResponse])
def update_image_annotations(
    image_id: int,
    annotations: List[AnnotationCreate],
    db: Session = Depends(get_db)
):
    """
    Overwrites the saved annotations for an image with the provided list.
    Marks the image 'labeled' when boxes remain, otherwise 'unlabeled'.
    """
    db_image = db.query(ImageModel).filter(ImageModel.id == image_id).first()
    if not db_image:
        raise HTTPException(status_code=404, detail="Image not found")

    # Delete old annotations
    db.query(Annotation).filter(Annotation.image_id == image_id).delete()

    # Add new annotations
    new_annotations = []
    for ann in annotations:
        db_ann = Annotation(
            image_id=image_id,
            box_id=ann.box_id,
            x1=ann.x1,
            y1=ann.y1,
            x2=ann.x2,
            y2=ann.y2,
            label=ann.label
        )
        db.add(db_ann)
        new_annotations.append(db_ann)

    db_image.status = "labeled" if new_annotations else "unlabeled"
    db.commit()

    for ann in new_annotations:
        db.refresh(ann)

    return new_annotations
