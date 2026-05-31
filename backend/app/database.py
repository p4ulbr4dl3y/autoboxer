import os
from sqlalchemy import create_engine
from sqlalchemy.orm import declarative_base, sessionmaker

DATABASE_FILE = "/Users/yegor/autoboxer/backend/autoboxer.db"
DATABASE_URL = f"sqlite:///{DATABASE_FILE}"

# Connect args needed for SQLite to enforce foreign key constraints
engine = create_engine(
    DATABASE_URL, 
    connect_args={"check_same_thread": False}
)

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()

def get_db():
    """Dependency for retrieving database session in routes."""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
