from pydantic import BaseModel, Field
from pydantic.color import Color
from typing import Optional

class AppSettings(BaseModel):
    brandName: str = Field(..., max_length=50)
    logoUrl: Optional[str] = None
    primaryColor: str

class SavedAppSettings(AppSettings):
    id: str

class UpdateSettingsPayload(BaseModel):
    brandName: str = Field(..., max_length=50)
    primaryColor: str
    logoUrl: Optional[str] = None

class SaveSettingsPayload(BaseModel):
    brandName: str = Field(..., max_length=50)
    logoUrl: Optional[str] = None
    primaryColor: str

class UploadLogoResponse(BaseModel):
    logoUrl: str
