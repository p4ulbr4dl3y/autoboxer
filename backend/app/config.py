import os

# Base paths
BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA_DIR = os.path.join(BASE_DIR, "data")
DATABASE_FILE = os.path.join(BASE_DIR, "autoboxer.db")
DATABASE_URL = f"sqlite:///{DATABASE_FILE}"

# Models configuration
LOCATEANYTHING_MODEL = "mlx-community/LocateAnything-3B-4bit"
DEFAULT_PROMPT = "Locate objects."
