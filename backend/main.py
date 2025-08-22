print("--- SCRIPT START ---")

import functions_framework
print("--- IMPORTED: functions_framework ---")

from fastapi import FastAPI
print("--- IMPORTED: FastAPI ---")

from fastapi.middleware.cors import CORSMiddleware
print("--- IMPORTED: CORSMiddleware ---")

try:
    from .api import settings
    print("--- IMPORTED: .api.settings ---")
except ImportError as e:
    print(f"--- FAILED to import .api.settings: {e} ---")
    # We can raise the error again if we want the script to halt here on failure
    raise

print("--- CREATING: FastAPI app instance ---")
app = FastAPI()
print("--- SUCCESS: FastAPI app instance created ---")


# CORS configuration
origins = [
    "http://localhost:4200",
    "http://127.0.0.1:8000",
    "http://0.0.0.0:8000",
    "http://localhost:8000",
    "https://n-vddslye5gra3nedbsoh5w66r27dyohl33wucu4q-0lu-script.googleusercontent.com",
]

print("--- CONFIGURING: CORSMiddleware ---")
app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
print("--- SUCCESS: CORSMiddleware configured ---")


print("--- INCLUDING: Settings router ---")
app.include_router(settings.router)
print("--- SUCCESS: Settings router included ---")


@app.get("/")
def read_root():
    return {"Hello": "World"}
print("--- SUCCESS: Root endpoint defined ---")


@functions_framework.http
def http_entry_point(request):
    """HTTP Cloud Function that serves the FastAPI app."""
    return app(request.scope, request.receive, request.send)
print("--- SUCCESS: HTTP entry point defined ---")
print("--- SCRIPT END ---")