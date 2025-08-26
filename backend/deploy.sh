#!/bin/bash

echo "🚀 Starting deployment of vigenair-backend..."

# Build Docker image
gcloud builds submit --tag gcr.io/demos-dev-467317/vigenair-backend .

# Deploy to Cloud Run
gcloud run deploy vigenair-backend \
  --image gcr.io/demos-dev-467317/vigenair-backend \
  --region=us-central1 \
  --platform managed \
  --allow-unauthenticated \
  --memory=4Gi \
  --set-env-vars=PROJECT_ID=demos-dev-467317,LOCATION=us-central1,GCS_BUCKET="vigenair-logo-space",ENV=demos-dev,FIRESTORE_DATABASE_ID=vigenair-db

echo "✅ Deployment command executed."