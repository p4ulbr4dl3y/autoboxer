import os
import io
import json
import datetime
import zipfile
from fastapi import APIRouter, HTTPException, Depends
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session
from PIL import Image

from app.database import get_db
from app.db_models import Project, ImageModel, Annotation

router = APIRouter(prefix="/api/v1/projects/{project_id}/export", tags=["export"])


@router.get("")
def export_project_annotations(
    project_id: int,
    format: str = "yolo",
    db: Session = Depends(get_db)
):
    """
    Exports the labeled dataset in ZIP format.
    Supports 'yolo' and 'coco' export schemas.
    """
    project = db.query(Project).filter(Project.id == project_id).first()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    if format not in ("yolo", "coco"):
        raise HTTPException(status_code=400, detail="Invalid format. Supported formats: 'yolo', 'coco'")

    images = db.query(ImageModel).filter(
        ImageModel.project_id == project_id,
        ImageModel.status == "labeled"
    ).all()

    if not images:
        raise HTTPException(status_code=400, detail="No labeled images to export in this project")

    # Determine unique classes
    custom_classes = [c.name for c in project.classes]
    annotated_classes = db.query(Annotation.label).join(ImageModel).filter(
        ImageModel.project_id == project_id,
        Annotation.label.isnot(None)
    ).distinct().all()
    annotated_classes = [c[0] for c in annotated_classes]

    all_classes = sorted(list(set(custom_classes + annotated_classes)))
    class_to_id = {name: idx for idx, name in enumerate(all_classes)}

    zip_buffer = io.BytesIO()

    with zipfile.ZipFile(zip_buffer, "w", zipfile.ZIP_DEFLATED) as zip_file:
        if format == "yolo":
            _export_yolo(zip_file, images, class_to_id)
        elif format == "coco":
            _export_coco(zip_file, images, project, class_to_id)

    zip_buffer.seek(0)
    filename = f"project_{project_id}_export_{format}.zip"
    return StreamingResponse(
        zip_buffer,
        media_type="application/zip",
        headers={"Content-Disposition": f"attachment; filename={filename}"}
    )


def _export_yolo(zip_file: zipfile.ZipFile, images: list, class_to_id: dict):
    """Write YOLO-format dataset into the zip."""
    yaml_lines = ["names:"]
    for name, idx in class_to_id.items():
        yaml_lines.append(f"  {idx}: {name}")
    zip_file.writestr("dataset.yaml", "\n".join(yaml_lines) + "\n")

    for db_image in images:
        if not os.path.exists(db_image.filepath):
            continue

        zip_file.write(db_image.filepath, f"images/{db_image.filename}")

        w_img, h_img = _get_image_dims(db_image)
        if not w_img or not h_img:
            continue

        label_lines = []
        for ann in db_image.annotations:
            c_id = class_to_id.get(ann.label, 0)
            w_box = ann.x2 - ann.x1
            h_box = ann.y2 - ann.y1
            x_c_norm = (ann.x1 + w_box / 2.0) / w_img
            y_c_norm = (ann.y1 + h_box / 2.0) / h_img
            w_norm = w_box / w_img
            h_norm = h_box / h_img
            label_lines.append(f"{c_id} {x_c_norm:.6f} {y_c_norm:.6f} {w_norm:.6f} {h_norm:.6f}")

        base_name, _ = os.path.splitext(db_image.filename)
        zip_file.writestr(f"labels/{base_name}.txt", "\n".join(label_lines) + "\n")


def _export_coco(zip_file: zipfile.ZipFile, images: list, project, class_to_id: dict):
    """Write COCO-format dataset into the zip."""
    coco_data = {
        "info": {
            "description": f"Autoboxer Export for {project.name}",
            "date_created": datetime.datetime.now().isoformat()
        },
        "images": [],
        "annotations": [],
        "categories": [{"id": idx, "name": name, "supercategory": "object"} for name, idx in class_to_id.items()]
    }

    ann_counter = 1
    for db_image in images:
        if not os.path.exists(db_image.filepath):
            continue

        zip_file.write(db_image.filepath, f"images/{db_image.filename}")

        w_img, h_img = _get_image_dims(db_image)
        if not w_img or not h_img:
            continue

        coco_data["images"].append({
            "id": db_image.id,
            "file_name": db_image.filename,
            "width": w_img,
            "height": h_img
        })

        for ann in db_image.annotations:
            c_id = class_to_id.get(ann.label, 0)
            w_box = ann.x2 - ann.x1
            h_box = ann.y2 - ann.y1
            coco_data["annotations"].append({
                "id": ann_counter,
                "image_id": db_image.id,
                "category_id": c_id,
                "bbox": [ann.x1, ann.y1, w_box, h_box],
                "area": w_box * h_box,
                "iscrowd": 0
            })
            ann_counter += 1

    zip_file.writestr("annotations.json", json.dumps(coco_data, indent=2))


def _get_image_dims(db_image):
    """Get image dimensions, falling back to reading from disk."""
    w, h = db_image.width, db_image.height
    if not w or not h:
        try:
            with Image.open(db_image.filepath) as im:
                w, h = im.size
        except Exception:
            pass
    return w, h
