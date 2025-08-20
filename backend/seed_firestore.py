from google.cloud import firestore
import os

os.environ['FIRESTORE_EMULATOR_HOST'] = '127.0.0.1:8181'
os.environ['PROJECT_ID'] = 'demos-dev-467317'

db = firestore.Client(project=os.environ['PROJECT_ID'])

# Define constants for the new structure
USER_ID = 'Google'
USERS_COLLECTION = 'users'
APP_SETTINGS_SUBCOLLECTION = 'appSettings'

# Add a sample saved setting under the new multi-tenant path
doc_ref = db.collection(USERS_COLLECTION).document(USER_ID).collection(APP_SETTINGS_SUBCOLLECTION).document()
doc_ref.set({
    'brandName': 'Test Brand',
    'logoUrl': 'https://example.com/logo.png',
    'primaryColor': '#123456'
})

print(f"Seeded Firestore emulator for user '{USER_ID}' with a sample saved setting.")