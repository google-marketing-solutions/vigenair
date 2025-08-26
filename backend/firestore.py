import os
from google.cloud import firestore
from fastapi import HTTPException, Request
import logging

logger = logging.getLogger(__name__)
PROJECT_ID = os.getenv("PROJECT_ID")
USERS_COLLECTION = "users"
APP_SETTINGS_SUBCOLLECTION = "appSettings"
ACTIVE_SETTING_SUBCOLLECTION = "activeSetting"
ACTIVE_SETTING_DOC = "default"

def get_firestore_client():
    try:
        client = firestore.Client(project=PROJECT_ID)
        logger.info(f"Firestore client initialized successfully for project: {client.project}")
        return client
    except Exception as e:
        logger.error(f"Failed to initialize Firestore client: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to connect to Firestore: {e}")

def get_user_id(request: Request):
    user_id = request.headers.get("X-User-Id")
    if not user_id:
        raise HTTPException(status_code=401, detail="Unauthorized: Missing user id")
    return user_id

def get_user_settings(user_id: str):
    db = get_firestore_client()
    doc_ref = db.collection(USERS_COLLECTION).document(user_id).collection(ACTIVE_SETTING_SUBCOLLECTION).document(ACTIVE_SETTING_DOC)
    doc = doc_ref.get()
    return doc.to_dict() if doc.exists else None

def set_user_settings(user_id: str, settings: dict):
    db = get_firestore_client()
    doc_ref = db.collection(USERS_COLLECTION).document(user_id).collection(ACTIVE_SETTING_SUBCOLLECTION).document(ACTIVE_SETTING_DOC)
    doc_ref.set(settings, merge=True)

def get_saved_settings(user_id: str):
    db = get_firestore_client()
    settings_ref = db.collection(USERS_COLLECTION).document(user_id).collection(APP_SETTINGS_SUBCOLLECTION)
    docs = settings_ref.stream()
    return [{"id": doc.id, **doc.to_dict()} for doc in docs]

def save_setting(user_id: str, settings: dict, setting_id: str = None):
    db = get_firestore_client()
    settings_ref = db.collection(USERS_COLLECTION).document(user_id).collection(APP_SETTINGS_SUBCOLLECTION)
    if setting_id:
        doc_ref = settings_ref.document(setting_id)
        doc_ref.set(settings, merge=True)
        return setting_id
    else:
        doc_ref = settings_ref.document()
        doc_ref.set(settings)
        return doc_ref.id

def delete_saved_setting(user_id: str, setting_id: str):
    db = get_firestore_client()
    doc_ref = db.collection(USERS_COLLECTION).document(user_id).collection(APP_SETTINGS_SUBCOLLECTION).document(setting_id)
    doc_ref.delete()

def get_saved_setting_by_id(user_id: str, setting_id: str):
    db = get_firestore_client()
    doc_ref = db.collection(USERS_COLLECTION).document(user_id).collection(APP_SETTINGS_SUBCOLLECTION).document(setting_id)
    doc = doc_ref.get()
    return doc.to_dict() if doc.exists else None
