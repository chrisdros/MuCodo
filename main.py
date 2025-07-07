# main.py
from fastapi import FastAPI, File, UploadFile, HTTPException
from fastapi.responses import HTMLResponse, FileResponse
from fastapi.staticfiles import StaticFiles
from pathlib import Path
import json
import logging

# Konfigurieren Sie das Logging
logging.basicConfig(level=logging.INFO) # INFO ist gut, DEBUG für noch mehr Details
logger = logging.getLogger(__name__)

logger.info("Anwendung: Initialisiere FastAPI App...")
app = FastAPI(
    title="Countdown Timer API",
    description="API for the Countdown Timer application, managing static files and config.json.",
    version="1.0.0"
)
logger.info("Anwendung: FastAPI App ist initialisiert!")

# Pfad zum statischen Verzeichnis
STATIC_DIR = Path("static")
CONFIG_FILE_PATH = STATIC_DIR / "config.json"

# Sicherstellen, dass das statische Verzeichnis existiert
STATIC_DIR.mkdir(parents=True, exist_ok=True)

# Sicherstellen, dass eine Standard-config.json existiert, falls nicht vorhanden
logger.info("Anwendung: Wenn keine Config-Datei vorhanden, wird sie jetzt erzeugt")
if not CONFIG_FILE_PATH.exists():
    default_config = {
        "predefinedTimes": ["0:30","1:00","2:30","4:00","5:00","6:00","8:00","106:00"],
        "changeTimes": ["0:30","0:10","0:05","-0:05","-0:10","-0:30"] ,
        "names": [
            "Arndt A.",
            "Bernd B.",
            "Christian C.",
            "Dieter D."
        ]
    }
    with open(CONFIG_FILE_PATH, "w", encoding="utf-8") as f:
        json.dump(default_config, f, indent=2, ensure_ascii=False)
        logger.info("Anwendung: Standard config-Datei erzeugt.")
    print("Default config.json created.")


# Statische Dateien bereitstellen (HTML, CSS, JS, Manifest etc.)
app.mount("/static", StaticFiles(directory=STATIC_DIR), name="static")

# Ein dedizierter Health-Check-Endpunkt
@app.get("/health")
async def health_check():
    logger.info("Anwendung: Health-Check-Endpunkt aufgerufen.")
    return {"status": "ok"}

@app.get("/", response_class=HTMLResponse, summary="Serve the Countdown page")
async def read_root():
    """
    Serves the main countdown page (index.html).
    """
    logger.info("Anwendung: Root-Endpunkt aufgerufen.")
    try:
        return FileResponse(STATIC_DIR / "index.html", media_type="text/html")
    except FileNotFoundError:
        logger.error("Anwendung: Die Seite index.html ist nicht zu finden.")
        raise HTTPException(status_code=404, detail="index.html not found.")

@app.get("/countdown", response_class=HTMLResponse, summary="Serve the Countdown display page")
async def get_countdown_display_page():
    """
    Serves the dedicated countdown display page (countdown.html).
    """
    try:
        return FileResponse(STATIC_DIR / "countdown.html", media_type="text/html")
    except FileNotFoundError:
        raise HTTPException(status_code=404, detail="countdown.html not found.")

@app.get("/admin", response_class=HTMLResponse, summary="Serve the Admin page")
async def get_admin_page():
    """
    Serves the administration page (admin.html).
    """
    try:
        return FileResponse(STATIC_DIR / "admin.html", media_type="text/html")
    except FileNotFoundError:
        raise HTTPException(status_code=404, detail="admin.html not found.")

@app.get("/api/config", summary="Download config.json")
async def download_config():
    """
    Allows downloading the current config.json file.
    """
    if CONFIG_FILE_PATH.exists():
        return FileResponse(CONFIG_FILE_PATH, media_type="application/json", filename="config.json")
    raise HTTPException(status_code=404, detail="config.json not found.")

@app.post("/api/config/upload", summary="Upload config.json")
async def upload_config(file: UploadFile = File(...)):
    """
    Allows uploading a new config.json file.
    The uploaded file must be a valid JSON.
    """
    if file.content_type != "application/json":
        raise HTTPException(status_code=400, detail="Only JSON files are allowed.")

    try:
        content = await file.read()
        json.loads(content) # Validate JSON content

        with open(CONFIG_FILE_PATH, "wb") as f:
            f.write(content)

        return {"message": f"config.json uploaded successfully! File size: {len(content)} bytes"}
    except json.JSONDecodeError:
        raise HTTPException(status_code=400, detail="Invalid JSON format in uploaded file.")
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to upload config.json: {e}")
