import pytest
from app.db_models import Project, ClassModel, ImageModel, Annotation

def test_create_project(client):
    response = client.post(
        "/api/v1/projects",
        json={
            "name": "Test Project",
            "description": "A test project",
            "default_prompt": "Locate cat.",
            "classes": [
                {"name": "cat", "color": "#FF0000", "prompt": "Locate cats."}
            ]
        }
    )
    assert response.status_code == 201
    data = response.json()
    assert data["name"] == "Test Project"
    assert len(data["classes"]) == 1
    assert data["classes"][0]["name"] == "cat"
    assert data["classes"][0]["color"] == "#FF0000"

def test_create_project_duplicate(client):
    # Create first project
    response = client.post(
        "/api/v1/projects",
        json={"name": "Test Project", "description": "Desc"}
    )
    assert response.status_code == 201

    # Create duplicate project
    response = client.post(
        "/api/v1/projects",
        json={"name": "Test Project", "description": "Desc"}
    )
    assert response.status_code == 400
    assert response.json()["detail"] == "Project with this name already exists"

def test_get_project_not_found(client):
    response = client.get("/api/v1/projects/999")
    assert response.status_code == 404
    assert response.json()["detail"] == "Project not found"

def test_delete_project_cascades(client, db):
    # Setup project with class, image, and annotation
    project = Project(name="Delete Me", description="Test cascade delete")
    db.add(project)
    db.commit()
    db.refresh(project)

    cls = ClassModel(project_id=project.id, name="dog", color="#0000FF")
    img = ImageModel(project_id=project.id, filename="dog.jpg", filepath="/tmp/dog.jpg", status="labeled")
    db.add_all([cls, img])
    db.commit()
    db.refresh(img)

    ann = Annotation(image_id=img.id, box_id=1, x1=10, y1=20, x2=100, y2=120, label="dog")
    db.add(ann)
    db.commit()

    # Call API to delete project
    response = client.delete(f"/api/v1/projects/{project.id}")
    assert response.status_code == 200

    # Verify everything is gone from DB
    assert db.query(Project).filter(Project.id == project.id).first() is None
    assert db.query(ClassModel).filter(ClassModel.project_id == project.id).count() == 0
    assert db.query(ImageModel).filter(ImageModel.project_id == project.id).count() == 0
    assert db.query(Annotation).filter(Annotation.image_id == img.id).count() == 0

def test_project_stats(client, db):
    project = Project(name="Stats Project")
    db.add(project)
    db.commit()
    db.refresh(project)

    img1 = ImageModel(project_id=project.id, filename="1.jpg", filepath="/tmp/1.jpg", status="unlabeled")
    img2 = ImageModel(project_id=project.id, filename="2.jpg", filepath="/tmp/2.jpg", status="labeled")
    img3 = ImageModel(project_id=project.id, filename="3.jpg", filepath="/tmp/3.jpg", status="in_progress")
    db.add_all([img1, img2, img3])
    db.commit()

    response = client.get(f"/api/v1/projects/{project.id}/stats")
    assert response.status_code == 200
    data = response.json()
    assert data["total_images"] == 3
    assert data["unlabeled_images"] == 1
    assert data["labeled_images"] == 1
    assert data["in_progress_images"] == 1

def test_create_project_class(client, db):
    project = Project(name="Class Project")
    db.add(project)
    db.commit()
    db.refresh(project)

    response = client.post(
        f"/api/v1/projects/{project.id}/classes",
        json={"name": "horse", "color": "#00FF00", "prompt": "Find horses."}
    )
    assert response.status_code == 201
    assert response.json()["name"] == "horse"

    # Try duplicate class name
    response = client.post(
        f"/api/v1/projects/{project.id}/classes",
        json={"name": "horse", "color": "#00FF00"}
    )
    assert response.status_code == 400
    assert response.json()["detail"] == "Class category already exists in this project"

def test_update_class(client, db):
    project = Project(name="Update Class Project")
    db.add(project)
    db.commit()
    db.refresh(project)

    cls = ClassModel(project_id=project.id, name="bird", color="#FFFF00", prompt="Locate bird.")
    db.add(cls)
    db.commit()
    db.refresh(cls)

    response = client.put(
        f"/api/v1/classes/{cls.id}",
        json={"name": "tweety-bird", "color": "#000000", "prompt": "Locate Tweety."}
    )
    assert response.status_code == 200
    data = response.json()
    assert data["name"] == "tweety-bird"
    assert data["color"] == "#000000"
    assert data["prompt"] == "Locate Tweety."

def test_delete_class_cleans_annotations(client, db):
    project = Project(name="Delete Class Project")
    db.add(project)
    db.commit()
    db.refresh(project)

    cls = ClassModel(project_id=project.id, name="cow", color="#777777")
    img = ImageModel(project_id=project.id, filename="cow.jpg", filepath="/tmp/cow.jpg", status="labeled")
    db.add_all([cls, img])
    db.commit()
    db.refresh(img)

    ann1 = Annotation(image_id=img.id, box_id=1, x1=10, y1=10, x2=50, y2=50, label="cow")
    ann2 = Annotation(image_id=img.id, box_id=2, x1=60, y1=60, x2=90, y2=90, label="another_label")
    db.add_all([ann1, ann2])
    db.commit()

    # Delete class "cow"
    response = client.delete(f"/api/v1/classes/{cls.id}")
    assert response.status_code == 200
    assert response.json()["affected_images"] == 1

    # Verify "cow" annotation is deleted but "another_label" remains
    assert db.query(Annotation).filter(Annotation.image_id == img.id).count() == 1
    remaining_ann = db.query(Annotation).filter(Annotation.image_id == img.id).first()
    assert remaining_ann.label == "another_label"
    
    # Image should still be labeled because "another_label" is still present
    db.refresh(img)
    assert img.status == "labeled"
