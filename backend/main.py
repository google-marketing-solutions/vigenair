
import logging
from fastapi import FastAPI, Response
from fastapi.middleware.cors import CORSMiddleware

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("vigenair.main")

try:
    from api import settings
    logger.info("Successfully imported api.settings and router.")
except Exception as e:
    logger.error(f"Failed to import api.settings: {e}")
    raise

app = FastAPI()

origins = [
    "http://localhost:4200",
    "http://127.0.0.1:8000",
    "http://0.0.0.0:8000",
    "http://localhost:8000",
    "https://vigenair-backend-647572723706.us-central1.run.app",
    "https://us-central1-demos-dev-467317.cloudfunctions.net/vigenair-backend",
    "https://n-vddslye5gra3nedbsoh5w66r27dyohl33wucu4q-0lu-script.googleusercontent.com",
]
app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allow_headers=["Content-Type", "x-user-id"],
)

app.include_router(settings.router, prefix="/api")

@app.get("/healthz")
def health_check():
    return {"status": "ok"}

@app.get("/")
def read_root():
    return {"message": "ViGenAir backend is running"}

@app.options("/api/settings")
def options_settings():
    return Response(status_code=200)