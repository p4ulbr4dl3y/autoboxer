import os
import io
import shutil
import tempfile
from fastapi import APIRouter, UploadFile, File, Form, HTTPException, status
from fastapi.responses import StreamingResponse

from app.models import LabelResponse
from app.pipeline import run_pipeline
from app.utils import visualize_predictions

router = APIRouter(prefix="/api/v1", tags=["pipeline"])


@router.post("/label", response_model=LabelResponse)
async def label_image(
    file: UploadFile = File(...),
    prompt: str = Form("Locate objects.")
):
    """
    Direct model execution on an uploaded image file.
    Returns structured JSON bounding boxes.
    """
    suffix = os.path.splitext(file.filename)[1] if file.filename else ".png"
    with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as tmp_file:
        try:
            shutil.copyfileobj(file.file, tmp_file)
            tmp_path = tmp_file.name
        except Exception as e:
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail=f"Failed to save uploaded file: {str(e)}"
            )

    try:
        results = run_pipeline(image_path=tmp_path, prompt=prompt)
        return results
    except Exception as e:
        import traceback
        traceback.print_exc()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Pipeline error: {str(e)}"
        )
    finally:
        if os.path.exists(tmp_path):
            os.remove(tmp_path)


@router.post("/label-visualize")
async def label_image_visualize(
    file: UploadFile = File(...),
    prompt: str = Form("Locate objects.")
):
    """
    Direct model execution on an uploaded image file.
    Returns the annotated image file directly as JPEG.
    """
    suffix = os.path.splitext(file.filename)[1] if file.filename else ".png"
    with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as tmp_file:
        try:
            shutil.copyfileobj(file.file, tmp_file)
            tmp_path = tmp_file.name
        except Exception as e:
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail=f"Failed to save uploaded file: {str(e)}"
            )

    try:
        results = run_pipeline(image_path=tmp_path, prompt=prompt)
        annotated_image = visualize_predictions(tmp_path, results["detections"])

        img_buffer = io.BytesIO()
        annotated_image.save(img_buffer, format="JPEG", quality=85)
        img_buffer.seek(0)

        return StreamingResponse(img_buffer, media_type="image/jpeg")
    except Exception as e:
        import traceback
        traceback.print_exc()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Pipeline error: {str(e)}"
        )
    finally:
        if os.path.exists(tmp_path):
            os.remove(tmp_path)
