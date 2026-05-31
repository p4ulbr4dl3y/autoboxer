import datetime
from sqlalchemy import Column, Integer, String, Float, DateTime, ForeignKey, Text
from sqlalchemy.orm import relationship
from app.database import Base

class Project(Base):
    __tablename__ = "projects"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, unique=True, index=True, nullable=False)
    description = Column(String, nullable=True)
    default_prompt = Column(String, default="Locate full-body LEGO minifigure characters.")
    default_method = Column(String, default="sam")
    default_threshold = Column(Float, default=0.3)
    created_at = Column(DateTime, default=lambda: datetime.datetime.now(datetime.timezone.utc))

    # Relationships
    images = relationship("ImageModel", back_populates="project", cascade="all, delete-orphan")
    classes = relationship("ClassModel", back_populates="project", cascade="all, delete-orphan")


class ClassModel(Base):
    __tablename__ = "classes"

    id = Column(Integer, primary_key=True, index=True)
    project_id = Column(Integer, ForeignKey("projects.id"), nullable=False)
    name = Column(String, nullable=False)
    color = Column(String, default="#34C759")  # Hex color code for annotations
    created_at = Column(DateTime, default=lambda: datetime.datetime.now(datetime.timezone.utc))

    # Relationships
    project = relationship("Project", back_populates="classes")


class ImageModel(Base):
    __tablename__ = "images"

    id = Column(Integer, primary_key=True, index=True)
    project_id = Column(Integer, ForeignKey("projects.id"), nullable=False)
    filename = Column(String, nullable=False)
    filepath = Column(String, nullable=False)
    width = Column(Integer, nullable=True)
    height = Column(Integer, nullable=True)
    status = Column(String, default="unlabeled")  # "unlabeled", "labeled", "in_progress"
    created_at = Column(DateTime, default=lambda: datetime.datetime.now(datetime.timezone.utc))

    # Relationships
    project = relationship("Project", back_populates="images")
    annotations = relationship("Annotation", back_populates="image", cascade="all, delete-orphan")


class Annotation(Base):
    __tablename__ = "annotations"

    id = Column(Integer, primary_key=True, index=True)
    image_id = Column(Integer, ForeignKey("images.id"), nullable=False)
    box_id = Column(Integer, nullable=False)
    x1 = Column(Integer, nullable=False)
    y1 = Column(Integer, nullable=False)
    x2 = Column(Integer, nullable=False)
    y2 = Column(Integer, nullable=False)
    
    # Serialized JSON fields
    polygon_json = Column(Text, nullable=True)  # List of [x, y] coordinates: [[x1, y1], [x2, y2], ...]
    label = Column(String, nullable=True)       # Name of the classified label
    score = Column(Float, nullable=True)        # Model confidence score
    top5_json = Column(Text, nullable=True)     # List of top 5 classifications

    created_at = Column(DateTime, default=lambda: datetime.datetime.now(datetime.timezone.utc))

    # Relationships
    image = relationship("ImageModel", back_populates="annotations")

    @property
    def polygon(self):
        import json
        return json.loads(self.polygon_json) if self.polygon_json else None

    @polygon.setter
    def polygon(self, val):
        import json
        self.polygon_json = json.dumps(val) if val is not None else None

    @property
    def top5(self):
        import json
        return json.loads(self.top5_json) if self.top5_json else None

    @top5.setter
    def top5(self, val):
        import json
        self.top5_json = json.dumps(val) if val is not None else None
