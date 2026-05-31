import os

# Models configuration
LOCATEANYTHING_MODEL = "mlx-community/LocateAnything-3B-4bit"
SAM3_MODEL_ID = "mlx-community/sam3-4bit"
VISION_EMBED_MODEL_NAME = "mlx-community/siglip2-base-patch16-224-8bit"

# Path to the source auto-labeler's vector database
SOURCE_AUTO_LABELER_DIR = "/Users/yegor/auto-labeler"
VECTOR_DB_DIR = os.path.join(SOURCE_AUTO_LABELER_DIR, "vector_db")
INDEX_FILE = os.path.join(VECTOR_DB_DIR, "minecraft_vision_index.faiss")
MAPPING_FILE = os.path.join(VECTOR_DB_DIR, "class_mapping.json")
CLF_DATA_DIR = os.path.join(VECTOR_DB_DIR, "minecraft_classification_data")

DEFAULT_PROMPT = "Locate full-body LEGO minifigure characters."
