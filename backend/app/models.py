import datetime
from pydantic import BaseModel, Field
from typing import List, Optional

# --- Pipeline Schemas (from the original design) ---
class ClassificationTopCandidate(BaseModel):
    label: str
    score: float

class ClassificationResult(BaseModel):
    label: str
    score: float
    top5: List[ClassificationTopCandidate]

class SegmentationResult(BaseModel):
    method: str
    score: float
    polygon: List[List[int]] = Field(..., description="List of [x, y] coordinates in original image pixel space")

class DetectionResult(BaseModel):
    box_id: int
    bbox: List[int] = Field(..., description="Bounding box [x1, y1, x2, y2] in original image pixel space")
    bbox_normalized: List[int] = Field(..., description="Bounding box [x1, y1, x2, y2] normalized (0-1000)")
    segmentation: Optional[SegmentationResult] = None
    classification: Optional[ClassificationResult] = None

class LabelResponse(BaseModel):
    filename: str
    width: int
    height: int
    detections: List[DetectionResult]


# --- Database-Related CRUD Schemas ---

class ClassCreate(BaseModel):
    name: str
    color: Optional[str] = "#34C759"  # Hex color code for annotations

class ClassResponse(BaseModel):
    id: int
    project_id: int
    name: str
    color: str
    created_at: datetime.datetime

    class Config:
        from_attributes = True


class ProjectBase(BaseModel):
    name: str
    description: Optional[str] = None
    default_prompt: Optional[str] = "Locate full-body LEGO minifigure characters."
    default_method: Optional[str] = "sam"
    default_threshold: Optional[float] = 0.3

class ProjectCreate(ProjectBase):
    pass

class ProjectUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    default_prompt: Optional[str] = None
    default_method: Optional[str] = None
    default_threshold: Optional[float] = None

class ProjectResponse(ProjectBase):
    id: int
    created_at: datetime.datetime
    classes: List[ClassResponse] = []

    class Config:
        from_attributes = True


class ImageResponse(BaseModel):
    id: int
    project_id: int
    filename: str
    filepath: str
    width: Optional[int] = None
    height: Optional[int] = None
    status: str
    created_at: datetime.datetime

    class Config:
        from_attributes = True


class AnnotationCreate(BaseModel):
    box_id: int
    x1: int
    y1: int
    x2: int
    y2: int
    polygon: Optional[List[List[int]]] = None
    label: Optional[str] = None
    score: Optional[float] = None
    top5: Optional[List[ClassificationTopCandidate]] = None

class AnnotationResponse(BaseModel):
    id: int
    image_id: int
    box_id: int
    x1: int
    y1: int
    x2: int
    y2: int
    polygon: Optional[List[List[int]]] = None
    label: Optional[str] = None
    score: Optional[float] = None
    top5: Optional[List[ClassificationTopCandidate]] = None
    created_at: datetime.datetime

    class Config:
        from_attributes = True
