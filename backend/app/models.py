import datetime
from pydantic import BaseModel, Field
from typing import List, Optional

# --- Pipeline Schemas ---
class DetectionResult(BaseModel):
    box_id: int
    bbox: List[int] = Field(..., description="Bounding box [x1, y1, x2, y2] in original image pixel space")
    bbox_normalized: List[int] = Field(..., description="Bounding box [x1, y1, x2, y2] normalized (0-1000)")
    label: Optional[str] = None

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
    default_prompt: Optional[str] = "Locate objects."

class ProjectCreate(ProjectBase):
    pass

class ProjectUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    default_prompt: Optional[str] = None

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
    label: Optional[str] = None

class AnnotationResponse(BaseModel):
    id: int
    image_id: int
    box_id: int
    x1: int
    y1: int
    x2: int
    y2: int
    label: Optional[str] = None
    created_at: datetime.datetime

    class Config:
        from_attributes = True
