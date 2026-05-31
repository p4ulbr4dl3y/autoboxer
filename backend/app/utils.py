from PIL import Image, ImageDraw, ImageFont
from typing import List, Dict, Any

def visualize_predictions(image_path: str, detections: List[Dict[str, Any]]) -> Image.Image:
    """
    Open an image and draw bounding boxes and labels.
    Returns a composite PIL Image in RGB format.
    """
    image = Image.open(image_path).convert("RGBA")
    draw = ImageDraw.Draw(image)
    
    # Vibrantly colored palette (Neon-ish)
    colors = [
        (255, 59, 48, 255),    # Red
        (52, 199, 89, 255),    # Green
        (0, 122, 255, 255),    # Blue
        (255, 204, 0, 255),    # Yellow
        (255, 149, 0, 255),    # Orange
        (175, 82, 222, 255),   # Purple
        (90, 200, 250, 255),   # Teal
        (255, 45, 85, 255),    # Pink
    ]
    
    try:
        font = ImageFont.truetype("/System/Library/Fonts/Helvetica.ttc", 20)
    except OSError:
        font = ImageFont.load_default()
        
    for i, det in enumerate(detections):
        color = colors[i % len(colors)]
        x1, y1, x2, y2 = det["bbox"]
        
        # 1. Draw Bounding Box
        draw.rectangle([x1, y1, x2, y2], outline=color, width=3)
        
        # 2. Label Text
        label_text = f"#{det['box_id']}"
        if det.get("label"):
            label_text = f"{det['label']}"
            
        # Draw background for text label
        try:
            # Handle text position (draw below box if it goes out of upper boundary)
            text_y = y1 - 26
            if text_y < 0:
                text_y = y1 + 5
                
            left, top, right, bottom = draw.textbbox((x1, text_y), label_text, font=font)
            
            # Draw semi-transparent background behind text
            draw.rectangle(
                [left - 4, top - 2, right + 4, bottom + 2],
                fill=(color[0], color[1], color[2], 210)
            )
            # Draw solid white text
            draw.text((left, top), label_text, fill=(255, 255, 255, 255), font=font)
        except Exception:
            # Fallback text draw for systems or PIL versions where textbbox is unsupported
            draw.text((x1 + 3, y1 + 3), label_text, fill=(color[0], color[1], color[2], 255))
            
    return image.convert("RGB")
