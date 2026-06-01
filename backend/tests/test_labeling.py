import pytest
import os
from unittest.mock import MagicMock
from app.db_models import Project, ClassModel, ImageModel, Annotation

def test_auto_label_image_class_prompts(client, db, mock_run_pipeline_fixture, tmp_path):
    # Setup database records
    project = Project(name="Labeling Project")
    db.add(project)
    db.commit()
    db.refresh(project)

    cls = ClassModel(project_id=project.id, name="cat", color="#FF0000", prompt="Locate cats.")
    
    # Create physical dummy image file to bypass path check
    dummy_filepath = os.path.join(tmp_path, "cat.jpg")
    with open(dummy_filepath, "wb") as f:
        f.write(b"dummy image content")
        
    img = ImageModel(project_id=project.id, filename="cat.jpg", filepath=dummy_filepath, status="unlabeled")
    db.add_all([cls, img])
    db.commit()
    db.refresh(img)

    # Setup ML pipeline mock response
    mock_run_pipeline_fixture.return_value = {
        "filename": "cat.jpg",
        "width": 800,
        "height": 600,
        "detections": [
            {
                "box_id": 1,
                "bbox": [50, 60, 200, 300],
                "bbox_normalized": [50, 60, 200, 300],
                "label": "cat"
            }
        ]
    }

    # Call API
    response = client.post(f"/api/v1/images/{img.id}/auto-label")
    assert response.status_code == 200
    data = response.json()
    assert len(data) == 1
    assert data[0]["label"] == "cat"
    assert data[0]["x1"] == 50
    assert data[0]["y1"] == 60
    assert data[0]["x2"] == 200
    assert data[0]["y2"] == 300

    # Verify run_pipeline was called with correct class prompt
    mock_run_pipeline_fixture.assert_called_with(image_path=dummy_filepath, prompt="Locate cats.")

    # Verify status changed to labeled
    db.refresh(img)
    assert img.status == "labeled"

def test_auto_label_image_manual_prompt_filter_by_class(client, db, mock_run_pipeline_fixture, tmp_path):
    project = Project(name="Labeling Project Manual")
    db.add(project)
    db.commit()
    db.refresh(project)

    cls_cat = ClassModel(project_id=project.id, name="cat", color="#FF0000")
    dummy_filepath = os.path.join(tmp_path, "animal.jpg")
    with open(dummy_filepath, "wb") as f:
        f.write(b"dummy image content")
    img = ImageModel(project_id=project.id, filename="animal.jpg", filepath=dummy_filepath, status="unlabeled")
    db.add_all([cls_cat, img])
    db.commit()
    db.refresh(img)

    # Pipeline returns a 'Cat' and a 'Dog'
    mock_run_pipeline_fixture.return_value = {
        "filename": "animal.jpg",
        "width": 800,
        "height": 600,
        "detections": [
            {"box_id": 1, "bbox": [10, 10, 100, 100], "bbox_normalized": [10, 10, 100, 100], "label": "Cat"},
            {"box_id": 2, "bbox": [20, 20, 200, 200], "bbox_normalized": [20, 20, 200, 200], "label": "Dog"}
        ]
    }

    # API with manual override prompt and filter_by_classes=True
    response = client.post(
        f"/api/v1/images/{img.id}/auto-label?prompt=Find animals&filter_by_classes=true"
    )
    assert response.status_code == 200
    data = response.json()
    
    # Dog should be filtered out because only 'cat' is registered in the project classes.
    # Case insensitivity ('Cat' vs 'cat') should match successfully.
    assert len(data) == 1
    assert data[0]["label"] == "cat"

def test_auto_label_overwrite_vs_append(client, db, mock_run_pipeline_fixture, tmp_path):
    project = Project(name="Overwrite Project")
    db.add(project)
    db.commit()
    db.refresh(project)

    cls = ClassModel(project_id=project.id, name="cat", color="#FF0000")
    dummy_filepath = os.path.join(tmp_path, "cat2.jpg")
    with open(dummy_filepath, "wb") as f:
        f.write(b"dummy image content")
    img = ImageModel(project_id=project.id, filename="cat2.jpg", filepath=dummy_filepath, status="labeled")
    db.add_all([cls, img])
    db.commit()
    db.refresh(img)

    # Seed an existing annotation
    existing_ann = Annotation(image_id=img.id, box_id=1, x1=5, y1=5, x2=20, y2=20, label="cat")
    db.add(existing_ann)
    db.commit()

    # Configure mock for 1 detection
    mock_run_pipeline_fixture.return_value = {
        "filename": "cat2.jpg",
        "width": 800,
        "height": 600,
        "detections": [
            {"box_id": 1, "bbox": [50, 50, 150, 150], "bbox_normalized": [50, 50, 150, 150], "label": "cat"}
        ]
    }

    # 1. Test append (mode = 'append') - FastAPI uses mode as parameter, default is overwrite.
    response = client.post(f"/api/v1/images/{img.id}/auto-label?mode=append")
    assert response.status_code == 200
    
    # We should have both annotations now (original and new one)
    assert db.query(Annotation).filter(Annotation.image_id == img.id).count() == 2

    # 2. Test overwrite (mode = 'overwrite')
    response = client.post(f"/api/v1/images/{img.id}/auto-label?mode=overwrite")
    assert response.status_code == 200
    
    # The previous target class annotations should be replaced by the single new detection
    assert db.query(Annotation).filter(Annotation.image_id == img.id).count() == 1
    new_ann = db.query(Annotation).filter(Annotation.image_id == img.id).first()
    assert new_ann.x1 == 50

def test_batch_auto_label_images(client, db, mock_run_pipeline_fixture, tmp_path):
    project = Project(name="Batch Project")
    db.add(project)
    db.commit()
    db.refresh(project)

    cls = ClassModel(project_id=project.id, name="cat", color="#FF0000")
    dummy_filepath = os.path.join(tmp_path, "cat3.jpg")
    with open(dummy_filepath, "wb") as f:
        f.write(b"dummy image content")
    img = ImageModel(project_id=project.id, filename="cat3.jpg", filepath=dummy_filepath, status="unlabeled")
    db.add_all([cls, img])
    db.commit()

    mock_run_pipeline_fixture.return_value = {
        "filename": "cat3.jpg",
        "width": 800,
        "height": 600,
        "detections": [
            {"box_id": 1, "bbox": [30, 30, 90, 90], "bbox_normalized": [30, 30, 90, 90], "label": "cat"}
        ]
    }

    # Trigger batch auto labeling
    response = client.post(
        f"/api/v1/projects/{project.id}/auto-label-all",
        json={
            "prompt": None,
            "target_images": "unlabeled",
            "mode": "overwrite",
            "filter_by_classes": True,
            "target_classes": ["cat"]
        }
    )
    assert response.status_code == 200
    assert response.json()["detail"] == "Batch auto-labeling started in the background."

    # Since FastAPI BackgroundTasks execute synchronously in the TestClient,
    # the image status should already be updated and annotations created.
    db.refresh(img)
    assert img.status == "labeled"
    assert db.query(Annotation).filter(Annotation.image_id == img.id).count() == 1
