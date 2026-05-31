import os
from fastapi import APIRouter, HTTPException, status, Depends, BackgroundTasks
from sqlalchemy.orm import Session
from typing import Optional, List

from app.database import get_db
from app.db_models import Project, ImageModel, Annotation
from app.models import AnnotationResponse, BatchAutoLabelRequest
from app.pipeline import run_pipeline

router = APIRouter(prefix="/api/v1", tags=["labeling"])


def _run_labeling_on_image(
    db: Session,
    db_image: ImageModel,
    project: Project,
    prompt: Optional[str],
    mode: str,
    filter_by_classes: bool,
    target_class_models: list,
) -> list:
    """Core labeling logic shared by single-image and batch endpoints."""
    # In overwrite mode: delete annotations for the target classes
    if mode == "overwrite":
        target_names_to_delete = [c.name for c in target_class_models]
        db.query(Annotation).filter(
            Annotation.image_id == db_image.id,
            Annotation.label.in_(target_names_to_delete)
        ).delete(synchronize_session=False)
        db.commit()

    # Re-index remaining annotations
    remaining_anns = db.query(Annotation).filter(
        Annotation.image_id == db_image.id
    ).order_by(Annotation.box_id).all()
    for idx, ann in enumerate(remaining_anns):
        ann.box_id = idx + 1
    box_idx = len(remaining_anns) + 1

    new_annotations = []

    # If manual prompt override is provided
    if prompt is not None and prompt.strip():
        results = run_pipeline(image_path=db_image.filepath, prompt=prompt)
        for det in results["detections"]:
            pred_label = det["label"] if det["label"] else target_class_models[0].name
            pred_label_lower = pred_label.lower()

            matched_class = None
            for c in target_class_models:
                c_name_lower = c.name.lower()
                if c_name_lower in pred_label_lower or pred_label_lower in c_name_lower:
                    matched_class = c
                    break

            if filter_by_classes:
                if not matched_class:
                    continue
                label = matched_class.name
            else:
                label = matched_class.name if matched_class else pred_label

            db_ann = Annotation(
                image_id=db_image.id,
                box_id=box_idx,
                x1=det["bbox"][0],
                y1=det["bbox"][1],
                x2=det["bbox"][2],
                y2=det["bbox"][3],
                label=label
            )
            db.add(db_ann)
            new_annotations.append(db_ann)
            box_idx += 1
    else:
        # Run class-specific prompts
        for target_class in target_class_models:
            cls_prompt = target_class.prompt if target_class.prompt else f"Locate {target_class.name}."
            results = run_pipeline(image_path=db_image.filepath, prompt=cls_prompt)
            for det in results["detections"]:
                db_ann = Annotation(
                    image_id=db_image.id,
                    box_id=box_idx,
                    x1=det["bbox"][0],
                    y1=det["bbox"][1],
                    x2=det["bbox"][2],
                    y2=det["bbox"][3],
                    label=target_class.name
                )
                db.add(db_ann)
                new_annotations.append(db_ann)
                box_idx += 1

    db.commit()
    return new_annotations


def _resolve_target_classes(project: Project, target_classes: Optional[List[str]] = None) -> list:
    """Resolve which class models to target."""
    if target_classes:
        target_names = [t.strip().lower() for t in target_classes if t.strip()]
        return [c for c in project.classes if c.name.lower() in target_names]
    return project.classes


@router.post("/images/{image_id}/auto-label", response_model=List[AnnotationResponse])
def auto_label_image_file(
    image_id: int,
    prompt: Optional[str] = None,
    mode: str = "overwrite",
    filter_by_classes: bool = True,
    target_classes: Optional[str] = None,
    db: Session = Depends(get_db)
):
    """
    Trigger the Locate Anything auto-labeling pipeline on an image registered in database.
    Saves the results directly as annotations and returns them.
    """
    db_image = db.query(ImageModel).filter(ImageModel.id == image_id).first()
    if not db_image:
        raise HTTPException(status_code=404, detail="Image not found")

    project = db_image.project
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    if not os.path.exists(db_image.filepath):
        raise HTTPException(status_code=404, detail="Image file not found on disk")

    db_image.status = "in_progress"
    db.commit()

    try:
        # Parse comma-separated target classes if provided
        target_list = None
        if target_classes:
            target_list = [t.strip() for t in target_classes.split(",") if t.strip()]

        target_class_models = _resolve_target_classes(project, target_list)

        if not target_class_models:
            has_annotations = db.query(Annotation).filter(Annotation.image_id == image_id).count() > 0
            db_image.status = "labeled" if has_annotations else "unlabeled"
            db.commit()
            return []

        new_annotations = _run_labeling_on_image(
            db=db,
            db_image=db_image,
            project=project,
            prompt=prompt,
            mode=mode,
            filter_by_classes=filter_by_classes,
            target_class_models=target_class_models,
        )

        has_annotations = db.query(Annotation).filter(Annotation.image_id == image_id).count() > 0
        db_image.status = "labeled" if has_annotations else "unlabeled"
        db.commit()

        for ann in new_annotations:
            db.refresh(ann)

        return new_annotations

    except Exception as e:
        has_annotations = db.query(Annotation).filter(Annotation.image_id == image_id).count() > 0
        db_image.status = "labeled" if has_annotations else "unlabeled"
        db.commit()
        import traceback
        traceback.print_exc()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Pipeline error: {str(e)}"
        )


def _process_batch_auto_label(
    project_id: int,
    prompt: Optional[str] = None,
    target_images: str = "unlabeled",
    mode: str = "overwrite",
    filter_by_classes: bool = True,
    target_classes: Optional[List[str]] = None
):
    """Background task for auto-labeling images in a project."""
    from app.database import SessionLocal
    db = SessionLocal()
    try:
        project = db.query(Project).filter(Project.id == project_id).first()
        if not project:
            return

        target_class_models = _resolve_target_classes(project, target_classes)
        if not target_class_models:
            return

        # Select images to process
        query = db.query(ImageModel).filter(ImageModel.project_id == project_id)
        if target_images != "all":
            query = query.filter(ImageModel.status == "unlabeled")
        images = query.all()

        for db_image in images:
            db_image.status = "in_progress"
            db.commit()

            try:
                _run_labeling_on_image(
                    db=db,
                    db_image=db_image,
                    project=project,
                    prompt=prompt,
                    mode=mode,
                    filter_by_classes=filter_by_classes,
                    target_class_models=target_class_models,
                )

                has_annotations = db.query(Annotation).filter(Annotation.image_id == db_image.id).count() > 0
                db_image.status = "labeled" if has_annotations else "unlabeled"
                db.commit()
            except Exception as e:
                has_annotations = db.query(Annotation).filter(Annotation.image_id == db_image.id).count() > 0
                db_image.status = "labeled" if has_annotations else "unlabeled"
                db.commit()
                print(f"Error auto-labeling image {db_image.id} ({db_image.filename}): {e}")
    finally:
        try:
            proj = db.query(Project).filter(Project.id == project_id).first()
            if proj:
                proj.batch_in_progress = False
                db.commit()
        except Exception as e:
            print(f"Error resetting project batch flag: {e}")
        db.close()


@router.post("/projects/{project_id}/auto-label-all")
def start_batch_auto_label(
    project_id: int,
    req: BatchAutoLabelRequest,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db)
):
    """Triggers batch auto-labeling on images of the project in the background."""
    project = db.query(Project).filter(Project.id == project_id).first()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    project.batch_in_progress = True
    db.commit()

    background_tasks.add_task(
        _process_batch_auto_label,
        project_id,
        req.prompt,
        req.target_images,
        req.mode,
        req.filter_by_classes,
        req.target_classes
    )

    return {"detail": "Batch auto-labeling started in the background."}
