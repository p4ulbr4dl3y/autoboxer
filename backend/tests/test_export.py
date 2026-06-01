import pytest
import os
import io
import json
import zipfile
from app.db_models import Project, ClassModel, ImageModel, Annotation

def test_export_project_not_found(client):
    response = client.get("/api/v1/projects/999/export?format=yolo")
    assert response.status_code == 404
    assert response.json()["detail"] == "Project not found"

def test_export_invalid_format(client, db):
    project = Project(name="Invalid Format Export Project")
    db.add(project)
    db.commit()
    db.refresh(project)

    response = client.get(f"/api/v1/projects/{project.id}/export?format=invalid_fmt")
    assert response.status_code == 400
    assert response.json()["detail"] == "Invalid format. Supported formats: 'yolo', 'coco'"

def test_export_no_labeled_images(client, db):
    project = Project(name="No Images Export Project")
    db.add(project)
    db.commit()
    db.refresh(project)

    # Image is unlabeled, so it shouldn't export
    img = ImageModel(project_id=project.id, filename="test.jpg", filepath="/tmp/test.jpg", status="unlabeled")
    db.add(img)
    db.commit()

    response = client.get(f"/api/v1/projects/{project.id}/export?format=yolo")
    assert response.status_code == 400
    assert response.json()["detail"] == "No labeled images to export in this project"

def test_export_yolo(client, db, tmp_path):
    project = Project(name="YOLO Export Project")
    db.add(project)
    db.commit()
    db.refresh(project)

    cls_cat = ClassModel(project_id=project.id, name="cat", color="#FF0000")
    db.add(cls_cat)

    # Create mock physical image file on disk
    dummy_filepath = os.path.join(tmp_path, "export_cat.jpg")
    with open(dummy_filepath, "wb") as f:
        f.write(b"dummy image bytes")

    img = ImageModel(
        project_id=project.id,
        filename="export_cat.jpg",
        filepath=dummy_filepath,
        width=800,
        height=600,
        status="labeled"
    )
    db.add(img)
    db.commit()
    db.refresh(img)

    ann = Annotation(
        image_id=img.id,
        box_id=1,
        x1=100,  # x_center = 200, width = 200
        y1=150,  # y_center = 250, height = 200
        x2=300,
        y2=350,
        label="cat"
    )
    db.add(ann)
    db.commit()

    # Call Export API for YOLO
    response = client.get(f"/api/v1/projects/{project.id}/export?format=yolo")
    assert response.status_code == 200
    assert response.headers["content-type"] == "application/zip"

    # Read zip content from response
    zip_bytes = io.BytesIO(response.content)
    with zipfile.ZipFile(zip_bytes) as z:
        namelist = z.namelist()
        assert "dataset.yaml" in namelist
        assert "images/export_cat.jpg" in namelist
        assert "labels/export_cat.txt" in namelist

        # Verify dataset.yaml content
        yaml_content = z.read("dataset.yaml").decode()
        assert "0: cat" in yaml_content

        # Verify YOLO label content: <class_id> <x_center> <y_center> <width> <height>
        # x_center_norm = ((100 + 300) / 2) / 800 = 200 / 800 = 0.25
        # y_center_norm = ((150 + 350) / 2) / 600 = 250 / 600 = 0.416667
        # width_norm = (300 - 100) / 800 = 200 / 800 = 0.25
        # height_norm = (350 - 150) / 600 = 200 / 600 = 0.333333
        label_content = z.read("labels/export_cat.txt").decode().strip()
        parts = label_content.split()
        assert parts[0] == "0"
        assert float(parts[1]) == pytest.approx(0.25)
        assert float(parts[2]) == pytest.approx(0.416667, abs=1e-5)
        assert float(parts[3]) == pytest.approx(0.25)
        assert float(parts[4]) == pytest.approx(0.333333, abs=1e-5)

def test_export_coco(client, db, tmp_path):
    project = Project(name="COCO Export Project")
    db.add(project)
    db.commit()
    db.refresh(project)

    cls_cat = ClassModel(project_id=project.id, name="cat", color="#FF0000")
    db.add(cls_cat)

    dummy_filepath = os.path.join(tmp_path, "export_coco_cat.jpg")
    with open(dummy_filepath, "wb") as f:
        f.write(b"dummy image bytes")

    img = ImageModel(
        project_id=project.id,
        filename="export_coco_cat.jpg",
        filepath=dummy_filepath,
        width=800,
        height=600,
        status="labeled"
    )
    db.add(img)
    db.commit()
    db.refresh(img)

    ann = Annotation(
        image_id=img.id,
        box_id=1,
        x1=100,
        y1=150,
        x2=300,
        y2=350,
        label="cat"
    )
    db.add(ann)
    db.commit()

    # Call Export API for COCO
    response = client.get(f"/api/v1/projects/{project.id}/export?format=coco")
    assert response.status_code == 200
    assert response.headers["content-type"] == "application/zip"

    # Read zip content from response
    zip_bytes = io.BytesIO(response.content)
    with zipfile.ZipFile(zip_bytes) as z:
        namelist = z.namelist()
        assert "annotations.json" in namelist
        assert "images/export_coco_cat.jpg" in namelist

        # Parse annotations.json
        coco_data = json.loads(z.read("annotations.json").decode())
        assert "info" in coco_data
        assert len(coco_data["images"]) == 1
        assert len(coco_data["annotations"]) == 1
        assert len(coco_data["categories"]) == 1

        # Check Category (COCO is 1-indexed)
        assert coco_data["categories"][0]["id"] == 1
        assert coco_data["categories"][0]["name"] == "cat"

        # Check Image item
        assert coco_data["images"][0]["file_name"] == "export_coco_cat.jpg"
        assert coco_data["images"][0]["width"] == 800
        assert coco_data["images"][0]["height"] == 600

        # Check Annotation item: bbox format is [x1, y1, width, height]
        ann_item = coco_data["annotations"][0]
        assert ann_item["bbox"] == [100, 150, 200, 200]
        assert ann_item["area"] == 40000
        assert ann_item["category_id"] == 1
