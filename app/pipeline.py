import os
import re
import gc
import json
import threading
import numpy as np
import cv2
from PIL import Image
from typing import List, Dict, Any, Tuple

# We import config inside or at the module level
from app.config import (
    LOCATEANYTHING_MODEL,
    SAM3_MODEL_ID,
    VISION_EMBED_MODEL_NAME,
    INDEX_FILE,
    MAPPING_FILE,
)

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

    def get_sam3(self):
        with self._lock:
            if "sam3" not in self._models:
                from mlx_vlm.models.sam3.generate import Sam3Predictor
                from mlx_vlm.models.sam3.processing_sam3 import Sam3Processor
                from mlx_vlm.utils import get_model_path, load_model

                print("[ModelManager] Loading SAM3...")
                mp = get_model_path(SAM3_MODEL_ID)
                model = load_model(mp)
                processor = Sam3Processor.from_pretrained(str(mp))
                # Predictor score threshold will be customized per predict call
                self._models["sam3"] = (model, processor, Sam3Predictor)
            return self._models["sam3"]

    def get_birefnet(self):
        with self._lock:
            if "birefnet" not in self._models:
                import torch
                from transformers import AutoModelForImageSegmentation
                from torchvision import transforms

                device = "mps" if torch.backends.mps.is_available() else "cpu"
                print(f"[ModelManager] Loading BiRefNet on {device}...")
                model = AutoModelForImageSegmentation.from_pretrained(
                    "ZhengPeng7/BiRefNet", trust_remote_code=True
                ).to(device).float().eval()

                transform = transforms.Compose([
                    transforms.Resize((1024, 1024)),
                    transforms.ToTensor(),
                    transforms.Normalize([0.485, 0.456, 0.406], [0.229, 0.224, 0.225]),
                ])
                self._models["birefnet"] = (model, transform, device)
            return self._models["birefnet"]

    def get_classifier(self):
        with self._lock:
            if "classifier" not in self._models:
                import mlx.core as mx
                from mlx_embeddings import load as load_embed
                import mlx_embeddings.models.siglip as siglip
                import faiss

                # Apply patching for MHA
                def patched_mha_call(self_mha, queries, keys, values, mask=None):
                    B, L, _ = queries.shape
                    dims = queries.shape[-1]
                    all_q = self_mha.in_proj(queries)
                    queries = all_q[:, :, :dims]
                    all_kv = self_mha.in_proj(keys)
                    keys = all_kv[:, :, dims:dims * 2]
                    values = all_kv[:, :, dims * 2:]
                    num_heads = self_mha.num_heads
                    queries = queries.reshape(B, L, num_heads, -1).transpose(0, 2, 1, 3)
                    S = keys.shape[1]
                    keys = keys.reshape(B, S, num_heads, -1).transpose(0, 2, 1, 3)
                    values = values.reshape(B, S, num_heads, -1).transpose(0, 2, 1, 3)
                    output = mx.fast.scaled_dot_product_attention(queries, keys, values, scale=self_mha.scale, mask=mask)
                    output = output.transpose(0, 2, 1, 3).reshape(B, L, -1)
                    return self_mha.out_proj(output)

                siglip.MHA.__call__ = patched_mha_call

                print("[ModelManager] Loading SigLIP2 + FAISS...")
                v_model, v_processor = load_embed(VISION_EMBED_MODEL_NAME)
                index = faiss.read_index(INDEX_FILE)
                with open(MAPPING_FILE, "r") as f:
                    class_mapping = json.load(f)

                self._models["classifier"] = (v_model, v_processor, index, class_mapping, mx)
            return self._models["classifier"]


# Helper functions
def normalize(v):
    norm = np.linalg.norm(v, axis=-1, keepdims=True)
    return v / (norm + 1e-10)


def make_square(pil_img, background_color=(255, 255, 255)):
    width, height = pil_img.size
    size = max(width, height)
    result = Image.new(pil_img.mode, (size, size), background_color)
    result.paste(pil_img, ((size - width) // 2, (size - height) // 2))
    return result


def extract_polygons_from_mask(mask: np.ndarray, offset_x: int, offset_y: int) -> List[List[int]]:
    """
    Find contours and return them as a list of points [[x1, y1], [x2, y2], ...]
    representing the outer polygon shape relative to the original image coordinates.
    """
    contours, _ = cv2.findContours(mask, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    if not contours:
        return []
    
    # We take the largest contour by area to represent the main object polygon
    main_contour = max(contours, key=cv2.contourArea)
    
    # Simplify contour to reduce point count (essential for polygon representation)
    epsilon = 0.005 * cv2.arcLength(main_contour, True)
    approx = cv2.approxPolyDP(main_contour, epsilon, True)
    
    polygon_pts = []
    if len(approx.shape) == 3:
        pts = approx.squeeze(1).tolist()
    else:
        pts = approx.tolist()
        
    for pt in pts:
        if isinstance(pt, list) and len(pt) == 2:
            polygon_pts.append([int(pt[0] + offset_x), int(pt[1] + offset_y)])
        elif isinstance(pt, (int, float)):
            # If squeeze made it 1D
            pass
            
    # Handle edge case where pts is a flat list of 2 coordinates
    if len(polygon_pts) == 0 and len(pts) == 2 and isinstance(pts[0], (int, float)):
        polygon_pts.append([int(pts[0] + offset_x), int(pts[1] + offset_y)])

    return polygon_pts


def run_pipeline(
    image_path: str,
    prompt: str,
    method: str = "sam",
    threshold: float = 0.3,
    classify: bool = True
) -> Dict[str, Any]:
    manager = ModelManager()
    
    # 1. Detect boxes
    model, processor, config, apply_chat_template, generate_fn = manager.get_locate_anything()
    formatted = apply_chat_template(processor, config, prompt, num_images=1)
    result = generate_fn(model, processor, prompt=formatted, image=image_path,
                         max_tokens=512, temperature=0.0, verbose=False)
    text = result.text if hasattr(result, "text") else str(result)

    boxes = []
    for m in re.finditer(r"<box><(\d+)><(\d+)><(\d+)><(\d+)></box>", text):
        boxes.append({
            "x1": int(m.group(1)),
            "y1": int(m.group(2)),
            "x2": int(m.group(3)),
            "y2": int(m.group(4))
        })
        
    image = Image.open(image_path).convert("RGB")
    W, H = image.size
    
    detections = []
    
    # Early exit if no boxes found
    if not boxes:
        return {
            "filename": os.path.basename(image_path),
            "width": W,
            "height": H,
            "detections": []
        }

    # 2. Segment
    segments = []
    if method == "sam":
        sam_model, sam_processor, predictor_class = manager.get_sam3()
        # Create predictor with custom threshold
        predictor = predictor_class(sam_model, sam_processor, score_threshold=max(threshold - 0.2, 0.05))
        
        text_hint = "object"
        for word in ["LEGO", "minifigure", "cat", "dog", "person"]:
            if word.lower() in prompt.lower():
                text_hint = word
                break
                
        for i, box in enumerate(boxes):
            x1 = int(box["x1"] / 1000 * W)
            y1 = int(box["y1"] / 1000 * H)
            x2 = int(box["x2"] / 1000 * W)
            y2 = int(box["y2"] / 1000 * H)
            # Ensure coordinates are in bounds
            x1, y1 = max(0, x1), max(0, y1)
            x2, y2 = min(W, x2), min(H, y2)
            if x2 <= x1 or y2 <= y1:
                continue
                
            crop = image.crop((x1, y1, x2, y2))
            det = predictor.predict(crop, text_prompt=text_hint)
            if len(det.scores) == 0:
                continue
                
            best = int(np.argmax(det.scores))
            if det.scores[best] < threshold:
                continue
                
            mask = det.masks[best].astype(np.uint8)
            kernel = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (7, 7))
            mask = cv2.morphologyEx(mask, cv2.MORPH_CLOSE, kernel, iterations=3)
            
            segments.append({
                "box_id": i + 1,
                "bbox": [x1, y1, x2, y2],
                "bbox_normalized": [box["x1"], box["y1"], box["x2"], box["y2"]],
                "crop": crop,
                "mask": mask,
                "score": float(det.scores[best]),
                "method": "sam3"
            })
            
    elif method == "birefnet":
        biref_model, biref_transform, biref_device = manager.get_birefnet()
        import torch
        
        for i, box in enumerate(boxes):
            x1 = int(box["x1"] / 1000 * W)
            y1 = int(box["y1"] / 1000 * H)
            x2 = int(box["x2"] / 1000 * W)
            y2 = int(box["y2"] / 1000 * H)
            x1, y1 = max(0, x1), max(0, y1)
            x2, y2 = min(W, x2), min(H, y2)
            if x2 <= x1 or y2 <= y1:
                continue
                
            crop = image.crop((x1, y1, x2, y2))
            w, h = crop.size
            
            tensor = biref_transform(crop).unsqueeze(0).to(biref_device)
            with torch.no_grad():
                output = biref_model(tensor)
                
            mask = output[-1] if isinstance(output, (list, tuple)) else output
            mask = mask.squeeze().cpu().numpy()
            mask = (mask - mask.min()) / (mask.max() - mask.min() + 1e-8)
            mask_bin = (mask > threshold).astype(np.uint8)
            mask_resized = np.array(
                Image.fromarray(mask_bin * 255, mode="L").resize((w, h), Image.NEAREST)
            ) // 255
            
            segments.append({
                "box_id": i + 1,
                "bbox": [x1, y1, x2, y2],
                "bbox_normalized": [box["x1"], box["y1"], box["x2"], box["y2"]],
                "crop": crop,
                "mask": mask_resized.astype(np.uint8),
                "score": 1.0,
                "method": "birefnet"
            })
    else:
        # No segmentation requested
        for i, box in enumerate(boxes):
            x1 = int(box["x1"] / 1000 * W)
            y1 = int(box["y1"] / 1000 * H)
            x2 = int(box["x2"] / 1000 * W)
            y2 = int(box["y2"] / 1000 * H)
            x1, y1 = max(0, x1), max(0, y1)
            x2, y2 = min(W, x2), min(H, y2)
            if x2 <= x1 or y2 <= y1:
                continue
                
            detections.append({
                "box_id": i + 1,
                "bbox": [x1, y1, x2, y2],
                "bbox_normalized": [box["x1"], box["y1"], box["x2"], box["y2"]],
                "segmentation": None,
                "classification": None
            })

    # 3. Process segments & classify if requested
    if method in ("sam", "birefnet") and segments:
        classification_results = []
        
        if classify:
            v_model, v_processor, faiss_index, class_mapping, mx = manager.get_classifier()
            
            for seg in segments:
                crop = seg["crop"]
                mask = seg["mask"]
                w, h = crop.size
                
                # Apply mask on white background and make square
                white = Image.new("RGB", (w, h), (255, 255, 255))
                mask_pil = Image.fromarray(mask * 255, mode="L")
                masked = Image.composite(crop, white, mask_pil)
                squared = make_square(masked)
                
                # Run feature extraction
                v_in = v_processor(images=[squared], return_tensors="np")
                pixel_values = mx.array(v_in["pixel_values"])
                feat = v_model.get_image_features(pixel_values)
                mx.eval(feat)
                emb = normalize(np.array(feat)).astype("float32")
                
                # Query index
                scores, indices = faiss_index.search(emb, 5)
                candidates = [class_mapping[idx] if idx < len(class_mapping) else f"class_{idx}" for idx in indices[0]]
                
                top5_candidates = []
                for score, label in zip(scores[0].tolist(), candidates):
                    top5_candidates.append({
                        "label": label,
                        "score": score
                    })
                
                classification_results.append({
                    "label": candidates[0],
                    "score": float(scores[0][0]),
                    "top5": top5_candidates
                })
        else:
            classification_results = [None] * len(segments)

        for seg, clf in zip(segments, classification_results):
            # Extract polygon from mask
            polygon = extract_polygons_from_mask(seg["mask"], seg["bbox"][0], seg["bbox"][1])
            
            detections.append({
                "box_id": seg["box_id"],
                "bbox": seg["bbox"],
                "bbox_normalized": seg["bbox_normalized"],
                "segmentation": {
                    "method": seg["method"],
                    "score": seg["score"],
                    "polygon": polygon
                },
                "classification": clf
            })

    # Clean up memory
    gc.collect()

    return {
        "filename": os.path.basename(image_path),
        "width": W,
        "height": H,
        "detections": detections
    }
