#!/bin/bash
set -e

# Configuration
PROJECT_ID=$(gcloud config get-value project)
REGION="us-central1"
SERVICE_NAME="supr-agent"
IMAGE="gcr.io/$PROJECT_ID/$SERVICE_NAME"

echo "Deploying Supr Agent to Google Cloud Run in project: $PROJECT_ID"

# 1. Build the Docker image natively
echo "Building Docker image..."
gcloud builds submit --tag $IMAGE

# 2. Deploy to Cloud Run
# Note: You must manually create the GCS bucket for FUSE before running this for state persistence.
# gcloud storage buckets create gs://$PROJECT_ID-supr-state
echo "Deploying to Cloud Run..."
gcloud run deploy $SERVICE_NAME \
  --image $IMAGE \
  --region $REGION \
  --allow-unauthenticated \
  --memory 2Gi \
  --cpu 2 \
  --execution-environment gen2 \
  --add-volume=name=supr-state,type=cloud-storage,bucket=$PROJECT_ID-supr-state \
  --add-volume-mount=volume=supr-state,mount-path=/app/.agents \
  --add-volume-mount=volume=supr-state,mount-path=/app/supr_workspaces \
  --update-env-vars=GEMINI_API_KEY=$GEMINI_API_KEY,NODE_ENV=production

echo "Deployment completed successfully!"
