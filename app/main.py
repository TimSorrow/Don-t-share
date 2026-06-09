import json
import logging
import sys
import os
from typing import List, Dict, Any
from fastapi import FastAPI, File, UploadFile, Form, HTTPException
from fastapi.responses import FileResponse, StreamingResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel
import io

# Determine base directory (frozen check for PyInstaller)
BASE_DIR = sys._MEIPASS if getattr(sys, 'frozen', False) else os.path.abspath(".")

from app.presidio_helper import (
    get_binary_status,
    update_binary_paths,
    analyze_text_pii,
    anonymize_text_pii,
    analyze_pdf_pii,
    redact_pdf_file
)

# Setup logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("PresidioApp")

app = FastAPI(title="Don't Share PII Cleaner API")

# Mount static files directory
import os
if not getattr(sys, 'frozen', False):
    os.makedirs(os.path.join(BASE_DIR, "static", "css"), exist_ok=True)
    os.makedirs(os.path.join(BASE_DIR, "static", "js"), exist_ok=True)
    os.makedirs(os.path.join(BASE_DIR, "app", "templates"), exist_ok=True)

app.mount("/static", StaticFiles(directory=os.path.join(BASE_DIR, "static")), name="static")

# Schemas
class AnalyzeTextRequest(BaseModel):
    text: str
    language: str = "ru"

class AnonymizeTextRequest(BaseModel):
    text: str
    entities: List[Dict[str, Any]]

class SettingsRequest(BaseModel):
    tesseract_cmd: str
    poppler_path: str

# Routes
@app.get("/")
def read_root():
    """Serves the main single-page application frontend."""
    index_path = os.path.join(BASE_DIR, "app", "templates", "index.html")
    if os.path.exists(index_path):
        return FileResponse(index_path)
    return HTMLResponse(content="<h3>Index file not found. Please verify folder structure.</h3>", status_code=404)

@app.get("/api/status")
def get_status():
    """Get system dependency status (Tesseract, Poppler)."""
    return get_binary_status()

@app.post("/api/settings")
def save_settings(req: SettingsRequest):
    """Save Tesseract and Poppler path settings dynamically."""
    try:
        update_binary_paths(req.tesseract_cmd, req.poppler_path)
        return {"status": "success", "message": "Paths updated successfully", "details": get_binary_status()}
    except Exception as e:
        logger.error(f"Error updating settings: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/analyze/text")
def analyze_text(req: AnalyzeTextRequest):
    """Analyze text for PII entities."""
    try:
        entities = analyze_text_pii(req.text, req.language)
        return {"entities": entities}
    except Exception as e:
        logger.error(f"Error analyzing text: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/anonymize/text")
def anonymize_text(req: AnonymizeTextRequest):
    """Anonymize text by applying replacements to the specified PII entities."""
    try:
        anonymized_text = anonymize_text_pii(req.text, req.entities)
        return {"anonymized_text": anonymized_text}
    except Exception as e:
        logger.error(f"Error anonymizing text: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/analyze/pdf")
async def analyze_pdf(
    file: UploadFile = File(...),
    language: str = Form("ru")
):
    """Uploads a PDF, renders pages to images, and runs PII box analysis."""
    if not file.filename.lower().endswith('.pdf'):
        raise HTTPException(status_code=400, detail="Только файлы PDF поддерживаются в этом эндпоинте")
        
    try:
        pdf_bytes = await file.read()
        page_images, pages_boxes = analyze_pdf_pii(pdf_bytes, language)
        return {
            "filename": file.filename,
            "pages": page_images,
            "boxes": pages_boxes
        }
    except Exception as e:
        logger.error(f"Error analyzing PDF: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/redact/pdf")
async def redact_pdf(
    file: UploadFile = File(...),
    pages_boxes_json: str = Form(...)
):
    """Uploads the original PDF and burns black boxes onto it using coordinate data from frontend."""
    if not file.filename.lower().endswith('.pdf'):
        raise HTTPException(status_code=400, detail="Только файлы PDF поддерживаются")
        
    try:
        pdf_bytes = await file.read()
        pages_boxes = json.loads(pages_boxes_json)
        
        redacted_pdf_bytes = redact_pdf_file(pdf_bytes, pages_boxes)
        
        from urllib.parse import quote
        safe_filename = quote(f"redacted_{file.filename}")
        return StreamingResponse(
            io.BytesIO(redacted_pdf_bytes),
            media_type="application/pdf",
            headers={"Content-Disposition": f"attachment; filename=\"{safe_filename}\"; filename*=UTF-8''{safe_filename}"}
        )
    except Exception as e:
        logger.error(f"Error redacting PDF: {e}")
        raise HTTPException(status_code=500, detail=str(e))
