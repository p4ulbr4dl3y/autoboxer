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
    ClassUpdate,
    ClassResponse,
    ImageResponse,
    AnnotationCreate,
    AnnotationResponse,
    BatchAutoLabelRequest
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
    version="3.0.0",
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


@app.put("/api/v1/classes/{class_id}", response_model=ClassResponse)
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
    """Retrieve saved bounding boxes and classes for an image."""
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
            label=ann.label
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
    prompt: Optional[str] = None,          # Manual override prompt (if provided)
    mode: str = "overwrite",
    filter_by_classes: bool = True,
    target_classes: Optional[str] = None,  # Comma-separated class names to target
    db: Session = Depends(get_db)
):
    """
    Trigger the Locate Anything auto-labeling pipeline on an image registered in database.
    Saves the results directly as annotations, updates image status,
    and returns the saved annotations.
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
        # Determine target classes
        if target_classes:
            target_names = [t.strip().lower() for t in target_classes.split(",") if t.strip()]
            target_class_models = [c for c in project.classes if c.name.lower() in target_names]
        else:
            target_class_models = project.classes

        if not target_class_models:
            # Revert in progress
            has_annotations = db.query(Annotation).filter(Annotation.image_id == image_id).count() > 0
            db_image.status = "labeled" if has_annotations else "unlabeled"
            db.commit()
            return []

        # In overwrite mode: delete annotations for the target classes
        if mode == "overwrite":
            target_names_to_delete = [c.name for c in target_class_models]
            db.query(Annotation).filter(
                Annotation.image_id == image_id,
                Annotation.label.in_(target_names_to_delete)
            ).delete(synchronize_session=False)
            db.commit()

        # Re-index remaining annotations
        remaining_anns = db.query(Annotation).filter(
            Annotation.image_id == image_id
        ).order_by(Annotation.box_id).all()
        for idx, ann in enumerate(remaining_anns):
            ann.box_id = idx + 1
        box_idx = len(remaining_anns) + 1

        new_annotations = []
        
        # If manual prompt override is provided:
        if prompt is not None and prompt.strip():
            # Run the single manual prompt
            results = run_pipeline(image_path=db_image.filepath, prompt=prompt)
            # Map detections to target classes
            for det in results["detections"]:
                pred_label = det["label"] if det["label"] else target_class_models[0].name
                pred_label_lower = pred_label.lower()
                
                # Smart matching
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
                    image_id=image_id,
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
            # Run prompt class-by-class
            for target_class in target_class_models:
                cls_prompt = target_class.prompt if target_class.prompt else f"Locate {target_class.name}."
                results = run_pipeline(image_path=db_image.filepath, prompt=cls_prompt)
                for det in results["detections"]:
                    db_ann = Annotation(
                        image_id=image_id,
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

        # Commit additions
        db.commit()

        # Update image status based on whether it has annotations
        has_annotations = db.query(Annotation).filter(Annotation.image_id == image_id).count() > 0
        db_image.status = "labeled" if has_annotations else "unlabeled"
        db.commit()
        
        for ann in new_annotations:
            db.refresh(ann)
            
        return new_annotations
        
    except Exception as e:
        # Revert status
        has_annotations = db.query(Annotation).filter(Annotation.image_id == image_id).count() > 0
        db_image.status = "labeled" if has_annotations else "unlabeled"
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
        if target_images == "all":
            images = db.query(ImageModel).filter(
                ImageModel.project_id == project_id
            ).all()
        else:
            images = db.query(ImageModel).filter(
                ImageModel.project_id == project_id,
                ImageModel.status == "unlabeled"
            ).all()
        
        project = db.query(Project).filter(Project.id == project_id).first()
        if not project:
            return
            
        # Determine target classes
        if target_classes:
            target_names = [t.strip().lower() for t in target_classes if t.strip()]
            target_class_models = [c for c in project.classes if c.name.lower() in target_names]
        else:
            target_class_models = project.classes

        if not target_class_models:
            return

        for db_image in images:
            db_image.status = "in_progress"
            db.commit()
            
            try:
                # In overwrite mode: delete target class annotations
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
                
                # If manual override prompt is provided
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
                            box_idx += 1
                            
                db.commit()
                # Update image status
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


@app.post("/api/v1/projects/{project_id}/auto-label-all")
def start_batch_auto_label(
    project_id: int,
    req: BatchAutoLabelRequest,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db)
):
    """
    Triggers batch auto-labeling on images of the project in the background.
    """
    project = db.query(Project).filter(Project.id == project_id).first()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
        
    project.batch_in_progress = True
    db.commit()

    # Enqueue task
    background_tasks.add_task(
        process_batch_auto_label,
        project_id,
        req.prompt,
        req.target_images,
        req.mode,
        req.filter_by_classes,
        req.target_classes
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
        "in_progress_images": in_progress,
        "batch_in_progress": project.batch_in_progress
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

    # Determine unique classes across project
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
            yaml_lines = ["names:"]
            for name, idx in class_to_id.items():
                yaml_lines.append(f"  {idx}: {name}")
            zip_file.writestr("dataset.yaml", "\n".join(yaml_lines) + "\n")
            
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
    prompt: str = Form("Locate objects.")
):
    """
    Direct model execution on an uploaded image file.
    Returns structured JSON bounding boxes.
    """
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
            prompt=prompt
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
    prompt: str = Form("Locate objects.")
):
    """
    Direct model execution on an uploaded image file.
    Returns the annotated image file directly as JPEG.
    """
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
            prompt=prompt
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
