from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Request
from typing import List

from ..services import firestore_service, storage_service
from ..models.settings import (
    AppSettings,
    SavedAppSettings,
    UpdateSettingsPayload,
    SaveSettingsPayload,
    UploadLogoResponse,
)

router = APIRouter()

# Dependency to get user_id from headers
def get_user_id(request: Request):
    user_id = request.headers.get("X-User-Id")
    if not user_id:
        raise HTTPException(status_code=401, detail="Unauthorized: Missing user id")
    # Basic email validation
    if '@' not in user_id or '.' not in user_id:
        raise HTTPException(status_code=400, detail="Invalid user ID format - must be a valid email address")
    # No need to sanitize, we'll use the email as-is
    return user_id

@router.get("/settings", response_model=AppSettings)
def get_settings(current_user_id: str = Depends(get_user_id)):
    settings = firestore_service.get_user_settings(current_user_id)
    if not settings:
        return AppSettings(
            brandName="ViGenAir",
            logoUrl="https://services.google.com/fh/files/misc/vigenair_logo.png",
            primaryColor="#3f51b5"
        )
    return AppSettings(**settings)

@router.put("/settings", status_code=204)
def update_settings(payload: UpdateSettingsPayload, current_user_id: str = Depends(get_user_id)):
    firestore_service.set_user_settings(current_user_id, payload.model_dump())

@router.get("/settings/saved", response_model=List[SavedAppSettings])
def get_saved_settings(current_user_id: str = Depends(get_user_id)):
    return firestore_service.get_saved_settings(current_user_id)

@router.post("/settings/saved", response_model=SavedAppSettings)
def save_setting(payload: SaveSettingsPayload, current_user_id: str = Depends(get_user_id)):
    data = payload.model_dump()
    setting_id = firestore_service.save_setting(current_user_id, data)
    response_data = data.copy()
    response_data['id'] = setting_id
    return SavedAppSettings(**response_data)

@router.put("/settings/saved/{setting_id}", response_model=SavedAppSettings)
def update_saved_setting(setting_id: str, payload: SaveSettingsPayload, current_user_id: str = Depends(get_user_id)):
    firestore_service.save_setting(current_user_id, payload.model_dump(), setting_id=setting_id)
    response_data = payload.model_dump()
    response_data['id'] = setting_id
    return SavedAppSettings(**response_data)

@router.get("/settings/saved/{setting_id}", response_model=SavedAppSettings)
def get_saved_setting(setting_id: str, current_user_id: str = Depends(get_user_id)):
    setting = firestore_service.get_saved_setting_by_id(current_user_id, setting_id)
    if not setting:
        raise HTTPException(status_code=404, detail="Setting not found")
    return SavedAppSettings(id=setting_id, **setting)

@router.delete("/settings/saved/{setting_id}", status_code=204)
def delete_saved_setting(setting_id: str, current_user_id: str = Depends(get_user_id)):
    firestore_service.delete_saved_setting(current_user_id, setting_id)

@router.post("/settings/logo", response_model=UploadLogoResponse)
def upload_logo(file: UploadFile = File(...), current_user_id: str = Depends(get_user_id)):
    if file.content_type not in ["image/jpeg", "image/png", "image/gif"]:
        raise HTTPException(status_code=400, detail="Invalid file type")
    logo_url = storage_service.upload_logo(current_user_id, file)
    return UploadLogoResponse(logoUrl=logo_url)
