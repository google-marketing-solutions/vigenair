# backend/services/storage_service.py

import os
import uuid
from unittest.mock import MagicMock
from fastapi import UploadFile

# --- Mocking GCP credentials ---
# This service is mocked because we don't have access to live GCP credentials.
# In a real environment, you would initialize a GCS client here.

# --- Environment Variables ---
GCS_BUCKET_NAME = os.environ.get("GCS_BUCKET_NAME", "vigenair-logo-space")

# --- Mock GCS Client ---
storage_client = MagicMock()

def upload_logo(user_id: str, file: UploadFile) -> str:
    """
    Uploads a logo to GCS and returns the public URL.
    This is a mock implementation.
    """
    if not file.filename:
        raise ValueError("File has no name")

    filename = f"logos/{user_id}/{uuid.uuid4()}_{file.filename}"

    # In a real implementation, you would upload the file to GCS here
    # bucket = storage_client.bucket(GCS_BUCKET_NAME)
    # blob = bucket.blob(filename)
    # blob.upload_from_file(file.file, content_type=file.content_type)
    # return blob.public_url

    # For this mock, we'll just return a fake URL
    mock_url = f"https://storage.googleapis.com/{GCS_BUCKET_NAME}/{filename}"
    print(f"Mock upload: {file.filename} to {mock_url}")
    return mock_url
