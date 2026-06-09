import os
import io
import sys
import shutil
import logging
from typing import List, Dict, Any, Tuple
from dotenv import load_dotenv

import PIL.Image as Image
import PIL.ImageDraw as ImageDraw
import pytesseract
from pdf2image import convert_from_bytes, convert_from_path

# Presidio imports
from presidio_analyzer import AnalyzerEngine, RecognizerRegistry
from presidio_analyzer.nlp_engine import NlpEngineProvider
from presidio_analyzer.predefined_recognizers import SpacyRecognizer
from presidio_anonymizer import AnonymizerEngine
from presidio_anonymizer.entities import RecognizerResult
from presidio_image_redactor import ImageAnalyzerEngine

# Setup logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("PresidioHelper")

# Load environment variables
load_dotenv()

# Global variables for paths
tesseract_cmd_path = os.getenv("TESSERACT_CMD", "")
poppler_path_env = os.getenv("POPPLER_PATH", "")

# Determine executable base directory (frozen check for PyInstaller)
if getattr(sys, 'frozen', False):
    EXE_DIR = os.path.dirname(sys.executable)
else:
    EXE_DIR = os.path.abspath(".")

def find_tesseract() -> str:
    """Auto-detect Tesseract executable on Windows or return default if in PATH."""
    # 1. Check local bundled folder first
    local_path = os.path.join(EXE_DIR, "tesseract", "tesseract.exe")
    if os.path.exists(local_path):
        logger.info(f"Auto-detected bundled Tesseract at: {local_path}")
        return local_path

    if tesseract_cmd_path:
        return tesseract_cmd_path
    if shutil.which("tesseract"):
        return "tesseract"
    
    # Common installation locations on Windows
    standard_paths = [
        r"C:\Program Files\Tesseract-OCR\tesseract.exe",
        r"C:\Program Files (x86)\Tesseract-OCR\tesseract.exe",
        os.path.expandvars(r"%LOCALAPPDATA%\Programs\Tesseract-OCR\tesseract.exe")
    ]
    for p in standard_paths:
        if os.path.exists(p):
            logger.info(f"Auto-detected Tesseract at: {p}")
            return p
    return ""

def find_poppler() -> str:
    """Auto-detect Poppler bin directory on Windows."""
    # 1. Check local bundled folders next to exe first
    local_lib_bin = os.path.join(EXE_DIR, "poppler", "Library", "bin")
    if os.path.exists(local_lib_bin) and os.path.exists(os.path.join(local_lib_bin, "pdftoppm.exe")):
        logger.info(f"Auto-detected bundled Poppler at: {local_lib_bin}")
        return local_lib_bin
        
    local_bin = os.path.join(EXE_DIR, "poppler", "bin")
    if os.path.exists(local_bin) and os.path.exists(os.path.join(local_bin, "pdftoppm.exe")):
        logger.info(f"Auto-detected bundled Poppler at: {local_bin}")
        return local_bin

    if poppler_path_env:
        return poppler_path_env
    if shutil.which("pdftoppm"):
        return "" # Already in PATH
    
    # Common installation locations on Windows
    standard_paths = [
        r"C:\Program Files\poppler\bin",
        r"C:\Program Files (x86)\poppler\bin",
        r"C:\poppler\bin",
    ]
    for p in standard_paths:
        if os.path.exists(p):
            logger.info(f"Auto-detected Poppler at: {p}")
            return p
            
    # Search for folder starting with 'poppler' in C:\Program Files
    try:
        pf = r"C:\Program Files"
        if os.path.exists(pf):
            for folder in os.listdir(pf):
                if folder.lower().startswith("poppler"):
                    bin_path = os.path.join(pf, folder, "bin")
                    if os.path.exists(bin_path):
                        logger.info(f"Auto-detected Poppler at: {bin_path}")
                        return bin_path
                    lib_bin = os.path.join(pf, folder, "Library", "bin")
                    if os.path.exists(lib_bin):
                        logger.info(f"Auto-detected Poppler at: {lib_bin}")
                        return lib_bin
    except Exception as e:
        logger.error(f"Error scanning C:\\Program Files for Poppler: {e}")
        
    return ""

# Initialize and configure OCR path
tesseract_cmd = find_tesseract()
if tesseract_cmd:
    pytesseract.pytesseract.tesseract_cmd = tesseract_cmd
    logger.info(f"Configured Tesseract path: {tesseract_cmd}")

# Define NLP Engine configuration
nlp_configuration = {
    "nlp_engine_name": "spacy",
    "models": [
        {"lang_code": "en", "model_name": "en_core_web_sm"},
        {"lang_code": "ru", "model_name": "ru_core_news_sm"}
    ],
}

# Create NLP Engine and Recognizer Registry
provider = NlpEngineProvider(nlp_configuration=nlp_configuration)
nlp_engine = provider.create_engine()

# Monkeypatch RecognizerRegistry supported_languages property so AnalyzerEngine allows both
RecognizerRegistry.supported_languages = property(lambda self: ["en", "ru"], lambda self, val: None)

registry = RecognizerRegistry()
registry.load_predefined_recognizers(nlp_engine=nlp_engine, languages=["en", "ru"])

# Create and add SpacyRecognizer for Russian to capture PERSON, LOCATION, ORGANIZATION
ru_spacy_recognizer = SpacyRecognizer(
    supported_language="ru",
    supported_entities=["PERSON", "LOCATION", "ORGANIZATION"]
)
registry.add_recognizer(ru_spacy_recognizer)

# Initialize engines
analyzer = AnalyzerEngine(nlp_engine=nlp_engine, registry=registry, supported_languages=["en", "ru"])
anonymizer = AnonymizerEngine()
image_analyzer = ImageAnalyzerEngine(analyzer_engine=analyzer)

def get_binary_status() -> Dict[str, Any]:
    """Returns the status and paths of Tesseract and Poppler binaries."""
    t_path = find_tesseract()
    p_path = find_poppler()
    
    # Validate Tesseract
    t_ok = False
    if t_path:
        try:
            pytesseract.get_tesseract_version()
            t_ok = True
        except Exception:
            pass
            
    # Validate Poppler
    p_ok = False
    if shutil.which("pdftoppm"):
        p_ok = True
    elif p_path and os.path.exists(os.path.join(p_path, "pdftoppm.exe")):
        p_ok = True
        
    return {
        "tesseract": {
            "path": t_path,
            "status": "available" if t_ok else "unavailable"
        },
        "poppler": {
            "path": p_path,
            "status": "available" if p_ok else "unavailable"
        }
    }

def update_binary_paths(t_cmd: str, p_path: str):
    """Dynamically updates paths for Tesseract and Poppler and writes them to .env."""
    global tesseract_cmd_path, poppler_path_env
    tesseract_cmd_path = t_cmd
    poppler_path_env = p_path
    
    if t_cmd:
        pytesseract.pytesseract.tesseract_cmd = t_cmd
        logger.info(f"Updated Tesseract path to: {t_cmd}")
        
    logger.info(f"Updated Poppler path to: {p_path}")
    
    # Persist settings in .env
    try:
        # Load host and port if they exist
        host = os.getenv("HOST", "127.0.0.1")
        port = os.getenv("PORT", "8000")
        
        with open(".env", "w", encoding="utf-8") as f:
            f.write("# Port and Host configurations\n")
            f.write(f"HOST={host}\n")
            f.write(f"PORT={port}\n\n")
            f.write("# Specify paths to binaries if they are not in the system PATH\n")
            f.write(f"TESSERACT_CMD={t_cmd}\n")
            f.write(f"POPPLER_PATH={p_path}\n")
        logger.info("Successfully persisted settings to .env file")
    except Exception as e:
        logger.error(f"Failed to persist settings to .env file: {e}")

def analyze_text_pii(text: str, language: str) -> List[Dict[str, Any]]:
    """Analyzes text for PII and returns detailed entity list."""
    if not text:
        return []
    
    # Presidio analysis
    results = analyzer.analyze(text=text, language=language)
    
    # Format results
    entities = []
    for res in results:
        entities.append({
            "entity_type": res.entity_type,
            "start": res.start,
            "end": res.end,
            "score": res.score,
            "text": text[res.start:res.end]
        })
    
    # Sort by start position
    entities.sort(key=lambda x: x["start"])
    return entities

def anonymize_text_pii(text: str, approved_entities: List[Dict[str, Any]]) -> str:
    """Anonymizes text using a list of approved PII entities."""
    if not text:
        return ""
    
    # Map raw dicts to RecognizerResult objects
    results = []
    for ent in approved_entities:
        results.append(
            RecognizerResult(
                entity_type=ent["entity_type"],
                start=ent["start"],
                end=ent["end"],
                score=ent.get("score", 1.0)
            )
        )
        
    # Anonymize using Presidio Anonymizer
    anonymized = anonymizer.anonymize(text=text, analyzer_results=results)
    return anonymized.text

def analyze_pdf_pii(file_bytes: bytes, language: str) -> Tuple[List[str], List[List[Dict[str, Any]]]]:
    """Renders PDF pages to images and runs PII analysis to return page images and PII bounding boxes."""
    poppler_bin = find_poppler()
    
    # Convert PDF to PIL Images
    try:
        if poppler_bin:
            pages = convert_from_bytes(file_bytes, poppler_path=poppler_bin)
        else:
            pages = convert_from_bytes(file_bytes)
    except Exception as e:
        logger.error(f"pdf2image conversion failed: {e}")
        raise RuntimeError(f"Не удалось обработать PDF: {e}. Убедитесь, что Poppler установлен и настроен.")
        
    page_images_base64 = []
    page_pii_boxes = []
    
    for i, page in enumerate(pages):
        # Convert page to base64 string for frontend display
        img_buffer = io.BytesIO()
        page.save(img_buffer, format="JPEG")
        img_b64 = img_buffer.getvalue()
        
        # Analyze page image for PII
        # image_analyzer.analyze takes PIL Image and passes args to text analyzer
        try:
            # We pass language to text analyzer via kwargs
            ocr_results = image_analyzer.analyze(page, language=language)
        except Exception as e:
            logger.error(f"Image PII analysis failed on page {i+1}: {e}")
            ocr_results = []
            
        boxes = []
        for res in ocr_results:
            boxes.append({
                "entity_type": res.entity_type,
                "score": res.score,
                "left": res.left,
                "top": res.top,
                "width": res.width,
                "height": res.height
            })
            
        # Convert page to Base64 (data URI format)
        import base64
        img_b64_str = base64.b64encode(img_b64).decode("utf-8")
        
        page_images_base64.append(f"data:image/jpeg;base64,{img_b64_str}")
        page_pii_boxes.append(boxes)
        
    return page_images_base64, page_pii_boxes

def redact_pdf_file(file_bytes: bytes, pages_boxes: List[List[Dict[str, Any]]]) -> bytes:
    """Burn black boxes over PDF pages using final approved bounding box coordinates."""
    poppler_bin = find_poppler()
    
    # Convert PDF to PIL Images to draw redactions
    if poppler_bin:
        pages = convert_from_bytes(file_bytes, poppler_path=poppler_bin)
    else:
        pages = convert_from_bytes(file_bytes)
        
    redacted_pages = []
    
    for i, page in enumerate(pages):
        # Create editable copy
        img_to_draw = page.copy()
        draw = ImageDraw.Draw(img_to_draw)
        
        # Bounding boxes for this page
        boxes = pages_boxes[i] if i < len(pages_boxes) else []
        
        for box in boxes:
            left = box["left"]
            top = box["top"]
            width = box["width"]
            height = box["height"]
            
            # Draw black box
            draw.rectangle(
                [left, top, left + width, top + height],
                fill="black",
                outline="black"
            )
            
        redacted_pages.append(img_to_draw)
        
    # Save back to a single PDF
    if redacted_pages:
        pdf_buffer = io.BytesIO()
        # Save first page, then append remaining
        redacted_pages[0].save(
            pdf_buffer,
            save_all=True,
            append_images=redacted_pages[1:],
            format="PDF"
        )
        return pdf_buffer.getvalue()
        
    return b""
