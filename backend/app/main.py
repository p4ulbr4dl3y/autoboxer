import os
import io
import shutil
import tempfile
import datetime
from fastapi import FastAPI, UploadFile, File, Form, HTTPException, status, Depends, BackgroundTasks
from fastapi.responses import StreamingResponse, FileResponse
from fastapi.middleware.cors import CORSMiddleware
from contextlib import asynccontextmanager
from sqlalchemy.orm import Session
from typing import List, Optional
from PIL import Image

from app.database import engine, Base, get_db
from app.db_models import Project, ClassModel, ImageModel, Annotation
from app.models import (
    LabelResponse,
    ProjectCreate,
    ProjectResponse,
    ClassCreate,
    ClassResponse,
    ImageResponse,
    AnnotationCreate,
    AnnotationResponse
)
from app.pipeline import run_pipeline, ModelManager
from app.utils import visualize_predictions

DATA_DIR = "/Users/yegor/autoboxer/backend/data"

# Lifespan manager to pre-warm the primary LocateAnything model and initialize DB
@asynccontextmanager
async def lifespan(app: FastAPI):
    # Create database tables if they do not exist
    print("Initializing SQLite database tables...")
    Base.metadata.create_all(bind=engine)
    
    # Create data directory for project images
    os.makedirs(DATA_DIR, exist_ok=True)
    print(f"Data storage directory initialized at: {DATA_DIR}")

    # Pre-warm LocateAnything model (loaded lazily, but triggered at startup)
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
    version="2.0.0",
    lifespan=lifespan
)

# Enable CORS for frontend integration
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/")
def read_root():
    return {
        "status": "online",
        "message": "Welcome to Locate Anything Auto-Labeling API. Use /docs for API documentation."
    }


# --- Project Management Endpoints ---

@app.post("/api/v1/projects", response_model=ProjectResponse, status_code=status.HTTP_201_CREATED)
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
        default_prompt=project.default_prompt,
        default_method=project.default_method,
        default_threshold=project.default_threshold
    )
    db.add(new_project)
    db.commit()
    db.refresh(new_project)
    return new_project


@app.get("/api/v1/projects", response_model=List[ProjectResponse])
def list_projects(skip: int = 0, limit: int = 100, db: Session = Depends(get_db)):
    """List all annotation projects."""
    return db.query(Project).offset(skip).limit(limit).all()


@app.get("/api/v1/projects/{project_id}", response_model=ProjectResponse)
def get_project(project_id: int, db: Session = Depends(get_db)):
    """Get project details by ID."""
    project = db.query(Project).filter(Project.id == project_id).first()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    return project


@app.delete("/api/v1/projects/{project_id}")
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


# --- Class Management Endpoints ---

@app.post("/api/v1/projects/{project_id}/classes", response_model=ClassResponse, status_code=status.HTTP_201_CREATED)
def create_project_class(project_id: int, project_class: ClassCreate, db: Session = Depends(get_db)):
    """Add a custom annotation class category to a project."""
    project = db.query(Project).filter(Project.id == project_id).first()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    
    # Check if class name already exists in this project
    existing = db.query(ClassModel).filter(
        ClassModel.project_id == project_id, 
        ClassModel.name == project_class.name
    ).first()
    if existing:
        raise HTTPException(status_code=400, detail="Class category already exists in this project")

    new_class = ClassModel(
        project_id=project_id,
        name=project_class.name,
        color=project_class.color
    )
    db.add(new_class)
    db.commit()
    db.refresh(new_class)
    return new_class


# --- Image Management & Upload Endpoints ---

@app.post("/api/v1/projects/{project_id}/upload-images", response_model=List[ImageResponse])
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
        
        # Extract basename to prevent directory traversal
        filename = os.path.basename(file.filename)
        filepath = os.path.join(project_dir, filename)

        # Handle duplicates with timestamp suffix
        if os.path.exists(filepath):
            base, ext = os.path.splitext(filename)
            timestamp = int(datetime.datetime.now().timestamp())
            filename = f"{base}_{timestamp}{ext}"
            filepath = os.path.join(project_dir, filename)

        # Save image file to disk
        try:
            with open(filepath, "wb") as buffer:
                shutil.copyfileobj(file.file, buffer)
        except Exception as e:
            continue

        # Extract image dimensions
        try:
            with Image.open(filepath) as img:
                width, height = img.size
        except Exception:
            width, height = None, None

        # Register in database
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


@app.get("/api/v1/projects/{project_id}/images", response_model=List[ImageResponse])
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


@app.get("/api/v1/images/{image_id}/file")
def get_image_file(image_id: int, db: Session = Depends(get_db)):
    """Serve the raw image file from disk by image database ID."""
    db_image = db.query(ImageModel).filter(ImageModel.id == image_id).first()
    if not db_image:
        raise HTTPException(status_code=404, detail="Image not found")
    
    if not os.path.exists(db_image.filepath):
        raise HTTPException(status_code=404, detail="Image file not found on disk")
        
    return FileResponse(db_image.filepath)


# --- Annotation Management Endpoints ---

@app.get("/api/v1/images/{image_id}/annotations", response_model=List[AnnotationResponse])
def get_image_annotations(image_id: int, db: Session = Depends(get_db)):
    """Retrieve saved bounding boxes, polygons, and classes for an image."""
    db_image = db.query(ImageModel).filter(ImageModel.id == image_id).first()
    if not db_image:
        raise HTTPException(status_code=404, detail="Image not found")
    
    return db_image.annotations


@app.put("/api/v1/images/{image_id}/annotations", response_model=List[AnnotationResponse])
def update_image_annotations(
    image_id: int, 
    annotations: List[AnnotationCreate], 
    db: Session = Depends(get_db)
):
    """
    Overwrites the saved annotations for an image with the provided list.
    Sets the image status to 'labeled'.
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
            polygon=ann.polygon,
            label=ann.label,
            score=ann.score,
            top5=[t.model_dump() for t in ann.top5] if ann.top5 else None
        )
        db.add(db_ann)
        new_annotations.append(db_ann)
        
    db_image.status = "labeled"
    db.commit()
    
    for ann in new_annotations:
        db.refresh(ann)
        
    return new_annotations


@app.post("/api/v1/images/{image_id}/auto-label", response_model=List[AnnotationResponse])
def auto_label_image_file(
    image_id: int,
    prompt: Optional[str] = None,
    method: Optional[str] = None,
    threshold: Optional[float] = None,
    classify: Optional[bool] = None,
    db: Session = Depends(get_db)
):
    """
    Trigger the Locate Anything auto-labeling pipeline on an image registered in database.
    Saves the results directly as annotations, updates image status to 'labeled',
    and returns the saved annotations.
    """
    db_image = db.query(ImageModel).filter(ImageModel.id == image_id).first()
    if not db_image:
        raise HTTPException(status_code=404, detail="Image not found")
        
    project = db_image.project
    
    # Fallback to project defaults if parameters are not provided
    run_prompt = prompt if prompt is not None else project.default_prompt
    run_method = method if method is not None else project.default_method
    run_threshold = threshold if threshold is not None else project.default_threshold
    run_classify = classify if classify is not None else True
    
    if run_method not in ("sam", "birefnet", "none"):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Invalid segmentation method '{run_method}'. Allowed values: 'sam', 'birefnet', 'none'"
        )

    if not os.path.exists(db_image.filepath):
        raise HTTPException(status_code=404, detail="Image file not found on disk")
        
    db_image.status = "in_progress"
    db.commit()

    try:
        results = run_pipeline(
            image_path=db_image.filepath,
            prompt=run_prompt,
            method=run_method,
            threshold=run_threshold,
            classify=run_classify
        )
        
        # Clear existing annotations
        db.query(Annotation).filter(Annotation.image_id == image_id).delete()
        
        new_annotations = []
        for det in results["detections"]:
            # Extract polygon from response structure
            polygon_pts = None
            if det.get("segmentation") and det["segmentation"].get("polygon"):
                polygon_pts = det["segmentation"]["polygon"]
                
            label = None
            score = None
            top5 = None
            if det.get("classification"):
                label = det["classification"]["label"]
                score = det["classification"]["score"]
                top5 = det["classification"]["top5"]
                
            db_ann = Annotation(
                image_id=image_id,
                box_id=det["box_id"],
                x1=det["bbox"][0],
                y1=det["bbox"][1],
                x2=det["bbox"][2],
                y2=det["bbox"][3],
                polygon=polygon_pts,
                label=label,
                score=score,
                top5=top5
            )
            db.add(db_ann)
            new_annotations.append(db_ann)
            
        db_image.status = "labeled"
        db.commit()
        
        for ann in new_annotations:
            db.refresh(ann)
            
        return new_annotations
        
    except Exception as e:
        db_image.status = "unlabeled"
        db.commit()
        import traceback
        traceback.print_exc()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Pipeline error: {str(e)}"
        )



# --- Background Batch Labeling & Export Endpoints ---

def process_batch_auto_label(
    project_id: int,
    prompt: str,
    method: str,
    threshold: float,
    classify: bool
):
    """Background task for auto-labeling all unlabeled images in a project."""
    from app.database import SessionLocal
    db = SessionLocal()
    try:
        images = db.query(ImageModel).filter(
            ImageModel.project_id == project_id,
            ImageModel.status == "unlabeled"
        ).all()
        
        for db_image in images:
            db_image.status = "in_progress"
            db.commit()
            
            try:
                results = run_pipeline(
                    image_path=db_image.filepath,
                    prompt=prompt,
                    method=method,
                    threshold=threshold,
                    classify=classify
                )
                
                # Delete existing annotations
                db.query(Annotation).filter(Annotation.image_id == db_image.id).delete()
                
                # Insert new annotations
                for det in results["detections"]:
                    polygon_pts = None
                    if det.get("segmentation") and det["segmentation"].get("polygon"):
                        polygon_pts = det["segmentation"]["polygon"]
                        
                    label = None
                    score = None
                    top5 = None
                    if det.get("classification"):
                        label = det["classification"]["label"]
                        score = det["classification"]["score"]
                        top5 = det["classification"]["top5"]
                        
                    db_ann = Annotation(
                        image_id=db_image.id,
                        box_id=det["box_id"],
                        x1=det["bbox"][0],
                        y1=det["bbox"][1],
                        x2=det["bbox"][2],
                        y2=det["bbox"][3],
                        polygon=polygon_pts,
                        label=label,
                        score=score,
                        top5=top5
                    )
                    db.add(db_ann)
                    
                db_image.status = "labeled"
                db.commit()
            except Exception as e:
                db_image.status = "unlabeled"
                db.commit()
                print(f"Error auto-labeling image {db_image.id} ({db_image.filename}): {e}")
                
    finally:
        db.close()


@app.post("/api/v1/projects/{project_id}/auto-label-all")
def start_batch_auto_label(
    project_id: int,
    background_tasks: BackgroundTasks,
    prompt: Optional[str] = None,
    method: Optional[str] = None,
    threshold: Optional[float] = None,
    classify: Optional[bool] = None,
    db: Session = Depends(get_db)
):
    """
    Triggers batch auto-labeling on all currently 'unlabeled' images of the project
    in the background.
    """
    project = db.query(Project).filter(Project.id == project_id).first()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
        
    run_prompt = prompt if prompt is not None else project.default_prompt
    run_method = method if method is not None else project.default_method
    run_threshold = threshold if threshold is not None else project.default_threshold
    run_classify = classify if classify is not None else True
    
    # Enqueue task
    background_tasks.add_task(
        process_batch_auto_label,
        project_id,
        run_prompt,
        run_method,
        run_threshold,
        run_classify
    )
    
    return {"detail": "Batch auto-labeling started in the background."}


@app.get("/api/v1/projects/{project_id}/stats")
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
        "in_progress_images": in_progress
    }


@app.get("/api/v1/projects/{project_id}/export")
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
        
    # Get all labeled images
    images = db.query(ImageModel).filter(
        ImageModel.project_id == project_id,
        ImageModel.status == "labeled"
    ).all()
    
    if not images:
        raise HTTPException(status_code=400, detail="No labeled images to export in this project")

    # Determine unique classes across project (custom ones + actually annotated ones)
    custom_classes = [c.name for c in project.classes]
    annotated_classes = db.query(Annotation.label).join(ImageModel).filter(
        ImageModel.project_id == project_id,
        Annotation.label.isnot(None)
    ).distinct().all()
    annotated_classes = [c[0] for c in annotated_classes]
    
    all_classes = sorted(list(set(custom_classes + annotated_classes)))
    class_to_id = {name: idx for idx, name in enumerate(all_classes)}
    
    import zipfile
    
    # Create an in-memory zip file
    zip_buffer = io.BytesIO()
    
    with zipfile.ZipFile(zip_buffer, "w", zipfile.ZIP_DEFLATED) as zip_file:
        if format == "yolo":
            # 1. Write dataset.yaml
            yaml_lines = ["names:"]
            for name, idx in class_to_id.items():
                yaml_lines.append(f"  {idx}: {name}")
            zip_file.writestr("dataset.yaml", "\n".join(yaml_lines) + "\n")
            
            # 2. Write images and labels
            for db_image in images:
                if not os.path.exists(db_image.filepath):
                    continue
                    
                # Add image
                zip_file.write(db_image.filepath, f"images/{db_image.filename}")
                
                # Fetch dimensions
                w_img = db_image.width
                h_img = db_image.height
                if not w_img or not h_img:
                    try:
                        with Image.open(db_image.filepath) as im:
                            w_img, h_img = im.size
                    except Exception:
                        continue
                
                # Generate label file contents
                label_lines = []
                for ann in db_image.annotations:
                    c_id = class_to_id.get(ann.label, 0)
                    
                    w_box = ann.x2 - ann.x1
                    h_box = ann.y2 - ann.y1
                    x_center = ann.x1 + w_box / 2.0
                    y_center = ann.y1 + h_box / 2.0
                    
                    x_c_norm = x_center / w_img
                    y_c_norm = y_center / h_img
                    w_norm = w_box / w_img
                    h_norm = h_box / h_img
                    
                    label_lines.append(f"{c_id} {x_c_norm:.6f} {y_c_norm:.6f} {w_norm:.6f} {h_norm:.6f}")
                    
                base_name, _ = os.path.splitext(db_image.filename)
                zip_file.writestr(f"labels/{base_name}.txt", "\n".join(label_lines) + "\n")
                
        elif format == "coco":
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
                
                w_img = db_image.width
                h_img = db_image.height
                if not w_img or not h_img:
                    try:
                        with Image.open(db_image.filepath) as im:
                            w_img, h_img = im.size
                    except Exception:
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
                    area = w_box * h_box
                    
                    coco_ann = {
                        "id": ann_counter,
                        "image_id": db_image.id,
                        "category_id": c_id,
                        "bbox": [ann.x1, ann.y1, w_box, h_box],
                        "area": area,
                        "iscrowd": 0
                    }
                    
                    if ann.polygon:
                        flat_polygon = []
                        for pt in ann.polygon:
                            flat_polygon.extend(pt)
                        coco_ann["segmentation"] = [flat_polygon]
                        
                    coco_data["annotations"].append(coco_ann)
                    ann_counter += 1
            
            import json
            zip_file.writestr("annotations.json", json.dumps(coco_data, indent=2))
            
    zip_buffer.seek(0)
    
    filename = f"project_{project_id}_export_{format}.zip"
    return StreamingResponse(
        zip_buffer,
        media_type="application/zip",
        headers={"Content-Disposition": f"attachment; filename={filename}"}
    )


# --- Core Pipeline Endpoints (Legacy / Single Image) ---

@app.post("/api/v1/label", response_model=LabelResponse)
async def label_image(
    file: UploadFile = File(...),
    prompt: str = Form("Locate full-body LEGO minifigure characters."),
    method: str = Form("sam"),
    threshold: float = Form(0.3),
    classify: bool = Form(True)
):
    """
    Direct model execution on an uploaded image file.
    Returns structured JSON bounding boxes and classifications.
    """
    if method not in ("sam", "birefnet", "none"):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Invalid segmentation method '{method}'. Allowed values: 'sam', 'birefnet', 'none'"
        )

    suffix = os.path.splitext(file.filename)[1] if file.filename else ".png"
    with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as tmp_file:
        try:
            shutil.copyfileobj(file.file, tmp_file)
            tmp_path = tmp_file.name
        except Exception as e:
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail=f"Failed to save uploaded file: {str(e)}"
            )

    try:
        results = run_pipeline(
            image_path=tmp_path,
            prompt=prompt,
            method=method,
            threshold=threshold,
            classify=classify
        )
        return results
    except Exception as e:
        import traceback
        traceback.print_exc()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Pipeline error: {str(e)}"
        )
    finally:
        if os.path.exists(tmp_path):
            os.remove(tmp_path)


@app.post("/api/v1/label-visualize")
async def label_image_visualize(
    file: UploadFile = File(...),
    prompt: str = Form("Locate full-body LEGO minifigure characters."),
    method: str = Form("sam"),
    threshold: float = Form(0.3),
    classify: bool = Form(True)
):
    """
    Direct model execution on an uploaded image file.
    Returns the annotated image file directly as JPEG.
    """
    if method not in ("sam", "birefnet", "none"):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Invalid segmentation method '{method}'. Allowed values: 'sam', 'birefnet', 'none'"
        )

    suffix = os.path.splitext(file.filename)[1] if file.filename else ".png"
    with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as tmp_file:
        try:
            shutil.copyfileobj(file.file, tmp_file)
            tmp_path = tmp_file.name
        except Exception as e:
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail=f"Failed to save uploaded file: {str(e)}"
            )

    try:
        results = run_pipeline(
            image_path=tmp_path,
            prompt=prompt,
            method=method,
            threshold=threshold,
            classify=classify
        )
        
        annotated_image = visualize_predictions(tmp_path, results["detections"])
        
        img_buffer = io.BytesIO()
        annotated_image.save(img_buffer, format="JPEG", quality=85)
        img_buffer.seek(0)
        
        return StreamingResponse(img_buffer, media_type="image/jpeg")
    except Exception as e:
        import traceback
        traceback.print_exc()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Pipeline error: {str(e)}"
        )
    finally:
        if os.path.exists(tmp_path):
            os.remove(tmp_path)
