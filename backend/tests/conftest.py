import os
import sys
from unittest.mock import MagicMock, patch

# Mock ModelManager class to prevent model loading on startup
mock_manager = MagicMock()
mock_manager.get_locate_anything.return_value = (
    MagicMock(),  # model
    MagicMock(),  # processor
    {},           # config
    MagicMock(),  # apply_chat_template
    MagicMock(),  # generate
)

# Apply patch to app.pipeline.ModelManager before importing app
pipeline_patcher = patch('app.pipeline.ModelManager', return_value=mock_manager)
pipeline_patcher.start()

# Also mock run_pipeline globally to prevent actual inference
pipeline_run_patcher = patch('app.routers.labeling.run_pipeline')
mock_run_pipeline = pipeline_run_patcher.start()

import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from fastapi.testclient import TestClient

# Import database and models to register classes on Base.metadata
from app.database import Base, get_db
import app.db_models

# Use file-based SQLite URL for testing to avoid connection wipeout issues
TEST_DB_FILE = "test_autoboxer.db"
SQLALCHEMY_DATABASE_URL = f"sqlite:///{TEST_DB_FILE}"
engine = create_engine(
    SQLALCHEMY_DATABASE_URL, connect_args={"check_same_thread": False}
)
TestingSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

# Monkeypatch database module variables globally to redirect all usage
import app.database
app.database.engine = engine
app.database.SessionLocal = TestingSessionLocal

@pytest.fixture(scope="session", autouse=True)
def clean_db_file_at_start():
    # Remove database file once at the beginning of the pytest session if it exists
    if os.path.exists(TEST_DB_FILE):
        try:
            os.remove(TEST_DB_FILE)
        except Exception:
            pass
    yield
    # Dispose connection pool and clean up at the end of the session
    engine.dispose()
    if os.path.exists(TEST_DB_FILE):
        try:
            os.remove(TEST_DB_FILE)
        except Exception:
            pass

@pytest.fixture(scope="function")
def db():
    # Create all tables cleanly for this test
    Base.metadata.create_all(bind=engine)
    session = TestingSessionLocal()
    try:
        yield session
    finally:
        session.close()
        # Drop all tables so that the next test starts with a clean slate
        Base.metadata.drop_all(bind=engine)
        # Clear connection pool cache to release any file locks
        engine.dispose()

@pytest.fixture(scope="function")
def client(db):
    # Import the FastAPI application
    from app.main import app

    def override_get_db():
        try:
            yield db
        finally:
            pass

    app.dependency_overrides[get_db] = override_get_db
    with TestClient(app) as test_client:
        yield test_client
    app.dependency_overrides.clear()

@pytest.fixture(scope="function")
def mock_run_pipeline_fixture():
    yield mock_run_pipeline
    mock_run_pipeline.reset_mock()
