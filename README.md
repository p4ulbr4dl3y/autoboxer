# Locate Anything Auto-Labeler API

A FastAPI service built for automatic bounding box detection, segmentation (using SAM3 or BiRefNet), and image classification (SigLIP2 + FAISS vector lookup).

The API runs optimized MLX models on Apple Silicon and provides clean bounding boxes, segmentation polygons, and classification tags suitable for integration with data labeling tools (like CVAT, Label Studio, etc.).

---

## 🛠️ Prerequisites

- **Apple Silicon Mac** (M1/M2/M3/M4) for MLX performance.
- Python 3.10+ (managed automatically via `uv`).
- `uv` package manager installed.

---

## 🚀 Running the API

You can start the development server using:

```bash
uv run main.py
```

This starts the FastAPI server on `http://localhost:8000` with hot-reloading enabled.

You can inspect the interactive OpenAPI documentation at:
- Swagger UI: [http://localhost:8000/docs](http://localhost:8000/docs)
- ReDoc: [http://localhost:8000/redoc](http://localhost:8000/redoc)

---

## 📡 API Endpoints

### 1. `POST /api/v1/label`
Upload an image, locate bounding boxes, segment boundaries, and classify targets. Returns JSON metadata.

#### Parameters (Multipart Form Data):
- `file` (File, required): The target image file.
- `prompt` (Text, default: `Locate full-body LEGO minifigure characters.`): Detection prompt.
- `method` (Text, default: `sam`): Segmentation method (`sam`, `birefnet`, or `none`).
- `threshold` (Float, default: `0.3`): Mask segmentation confidence threshold.
- `classify` (Boolean, default: `true`): Perform SigLIP2 + FAISS classification.

#### Example Response:
```json
{
  "filename": "lego_minifigures.png",
  "width": 708,
  "height": 468,
  "detections": [
    {
      "box_id": 1,
      "bbox": [0, 26, 193, 408],
      "bbox_normalized": [0, 56, 273, 873],
      "segmentation": {
        "method": "sam3",
        "score": 0.6579,
        "polygon": [
          [33, 26],
          [27, 125],
          [38, 143]
        ]
      },
      "classification": {
        "label": "min199",
        "score": 0.0484,
        "top5": [
          { "label": "min199", "score": 0.0484 },
          { "label": "min160", "score": 0.0530 }
        ]
      }
    }
  ]
}
```

### 2. `POST /api/v1/label-visualize`
Upload an image and parameters to receive the **annotated image file directly** (JPEG format). Perfect for quick visual verification.

Features included in visualization:
- Colored boundary outline for bounding boxes.
- Semi-transparent colored overlay highlighting the exact SAM3/BiRefNet segmented mask.
- Dynamic text labels hovering over boxes displaying `class_name (score)`.

---

## 💻 Client Integration Examples

### Python (using `requests`)
```python
import requests

url = "http://localhost:8000/api/v1/label"
files = {"file": open("image.jpg", "rb")}
data = {
    "prompt": "Locate full-body LEGO minifigure characters.",
    "method": "sam",
    "threshold": "0.3",
    "classify": "true"
}

response = requests.post(url, files=files, data=data)
print(response.json())
```

### cURL
```bash
curl -X POST "http://localhost:8000/api/v1/label" \
  -H "accept: application/json" \
  -H "Content-Type: multipart/form-data" \
  -F "file=@/path/to/your/image.png;type=image/png" \
  -F "prompt=Locate LEGO minifigures" \
  -F "method=sam" \
  -F "threshold=0.3" \
  -F "classify=true"
```
