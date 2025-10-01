import os
from google.cloud import firestore
from google.api_core import exceptions

# --- CONFIGURATION ---
PROJECT_ID = 'demos-dev-467317'
DATABASE_ID = 'vigenair-db' # <-- ADD THIS LINE
# --- END CONFIGURATION ---

print("Attempting to connect to Firestore...")

try:
    # Update the client to specify your database name
    db = firestore.Client(project=PROJECT_ID, database=DATABASE_ID) # <-- UPDATE THIS LINE
    
    print(f"✅ Firestore client initialized successfully for project '{PROJECT_ID}' and database '{DATABASE_ID}'.")

    doc_ref = db.collection('users').document('Google')
    print(f"Attempting to fetch document: '{doc_ref.path}'...")
    
    doc = doc_ref.get()

    if doc.exists:
        print("\n--- SUCCESS! ---")
        print("✅ Successfully connected to Firestore and fetched the document.")
        print("Document data:", doc.to_dict())
    else:
        print("\n--- CONNECTION OK, BUT... ---")
        print(f"🟡 Connection to Firestore was successful, but the document at '{doc_ref.path}' was not found.")

except Exception as e:
    print("\n--- FAILURE ---")
    print("❌ AN UNEXPECTED ERROR OCCURRED.")
    print("   Error details:", e)