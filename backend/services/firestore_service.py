import os
from google.cloud import firestore
from dotenv import load_dotenv

load_dotenv()

PROJECT_ID = os.getenv('PROJECT_ID')
DATABASE_ID = os.getenv('FIRESTORE_DATABASE_ID', 'vigenair-db')
USERS_COLLECTION = 'users'
APP_SETTINGS_SUBCOLLECTION = 'appSettings'
ACTIVE_SETTING_SUBCOLLECTION = 'activeSetting'
ACTIVE_SETTING_DOC = 'default'

def get_firestore_client():
    return firestore.Client(project=PROJECT_ID, database=DATABASE_ID)

def get_user_settings(user_id: str) -> dict | None:
    """Gets the active settings for a given user."""
    db = get_firestore_client()
    doc_ref = db.collection(USERS_COLLECTION).document(user_id).collection(ACTIVE_SETTING_SUBCOLLECTION).document(ACTIVE_SETTING_DOC)
    doc = doc_ref.get()
    return doc.to_dict() if doc.exists else None

def set_user_settings(user_id: str, settings: dict):
    """Sets the active settings for a given user."""
    db = get_firestore_client()
    doc_ref = db.collection(USERS_COLLECTION).document(user_id).collection(ACTIVE_SETTING_SUBCOLLECTION).document(ACTIVE_SETTING_DOC)
    doc_ref.set(settings, merge=True)

def get_saved_settings(user_id: str) -> list[dict]:
    """Gets the list of saved settings for a given user."""
    db = get_firestore_client()
    settings_ref = db.collection(USERS_COLLECTION).document(user_id).collection(APP_SETTINGS_SUBCOLLECTION)
    docs = settings_ref.stream()
    return [{'id': doc.id, **doc.to_dict()} for doc in docs]

def save_setting(user_id: str, settings: dict, setting_id: str = None) -> str:
    """Saves or updates a specific setting in the user's appSettings collection."""
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
    """Deletes a specific saved setting for a given user."""
    db = get_firestore_client()
    doc_ref = db.collection(USERS_COLLECTION).document(user_id).collection(APP_SETTINGS_SUBCOLLECTION).document(setting_id)
    doc_ref.delete()

def get_saved_setting_by_id(user_id: str, setting_id: str) -> dict | None:
    """Gets a single saved setting by its ID for a given user."""
    db = get_firestore_client()
    doc_ref = db.collection(USERS_COLLECTION).document(user_id).collection(APP_SETTINGS_SUBCOLLECTION).document(setting_id)
    doc = doc_ref.get()
    return doc.to_dict() if doc.exists else None
    return doc.to_dict() if doc.exists else None
