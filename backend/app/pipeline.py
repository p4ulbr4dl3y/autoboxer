import os
import re
import gc
import json
import threading
from PIL import Image
from typing import List, Dict, Any

from app.config import LOCATEANYTHING_MODEL

class ModelManager:
    _instance = None
    _lock = threading.Lock()

    def __new__(cls, *args, **kwargs):
        with cls._lock:
            if cls._instance is None:
                cls._instance = super(ModelManager, cls).__new__(cls)
                cls._instance._init_models()
            return cls._instance

    def _init_models(self):
        self._models = {}
        self._lock = threading.Lock()

    def get_locate_anything(self):
        with self._lock:
            if "locate_anything" not in self._models:
                import mlx_vlm
                from huggingface_hub import hf_hub_download
                from mlx_vlm.prompt_utils import apply_chat_template

                print("[ModelManager] Loading LocateAnything-3B...")
                model, processor = mlx_vlm.load(LOCATEANYTHING_MODEL)
                cfg_path = hf_hub_download(LOCATEANYTHING_MODEL, "config.json")
                with open(cfg_path) as f:
                    config = json.load(f)
                
                self._models["locate_anything"] = (model, processor, config, apply_chat_template, mlx_vlm.generate)
            return self._models["locate_anything"]


def run_pipeline(
    image_path: str,
    prompt: str,
) -> Dict[str, Any]:
    manager = ModelManager()
    
    # 1. Detect boxes
    model, processor, config, apply_chat_template, generate_fn = manager.get_locate_anything()
    formatted = apply_chat_template(processor, config, prompt, num_images=1)
    result = generate_fn(model, processor, prompt=formatted, image=image_path,
                         max_tokens=512, temperature=0.0, verbose=False)
    text = result.text if hasattr(result, "text") else str(result)

    image = Image.open(image_path).convert("RGB")
    W, H = image.size

    detections = []
    box_counter = 1
    
    # Parse format: (optional label ref) + box coordinates
    pattern = r"(?:<ref>(.*?)</ref>)?\s*<box><(\d+)><(\d+)><(\d+)><(\d+)></box>"
    
    for m in re.finditer(pattern, text):
        ref_label = m.group(1)
        x1_norm = int(m.group(2))
        y1_norm = int(m.group(3))
        x2_norm = int(m.group(4))
        y2_norm = int(m.group(5))
        
        # Scale to pixel coordinates
        x1_px = int(x1_norm / 1000 * W)
        y1_px = int(y1_norm / 1000 * H)
        x2_px = int(x2_norm / 1000 * W)
        y2_px = int(y2_norm / 1000 * H)
        
        # Ensure within bounds
        x1_px, y1_px = max(0, x1_px), max(0, y1_px)
        x2_px, y2_px = min(W, x2_px), min(H, y2_px)
        
        if x2_px <= x1_px or y2_px <= y1_px:
            continue
            
        detections.append({
            "box_id": box_counter,
            "bbox": [x1_px, y1_px, x2_px, y2_px],
            "bbox_normalized": [x1_norm, y1_norm, x2_norm, y2_norm],
            "label": ref_label
        })
        box_counter += 1

    gc.collect()

    return {
        "filename": os.path.basename(image_path),
        "width": W,
        "height": H,
        "detections": detections
    }
