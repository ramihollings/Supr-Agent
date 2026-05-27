#!/bin/bash
set -e

# Configuration
PROJECT_ID=$(gcloud config get-value project)
REGION="us-central1"
SERVICE_NAME="supr-agent"
IMAGE="$REGION-docker.pkg.dev/$PROJECT_ID/supr-repo/$SERVICE_NAME"

echo "Deploying Supr Agent to Google Cloud Run in project: $PROJECT_ID"

# 1. Ensure the Artifact Registry repository exists in the target region
echo "Checking/creating Artifact Registry repository 'supr-repo'..."
gcloud artifacts repositories describe supr-repo --location=$REGION --project=$PROJECT_ID >/dev/null 2>&1 || \
  gcloud artifacts repositories create supr-repo \
    --repository-format=docker \
    --location=$REGION \
    --project=$PROJECT_ID \
    --description="Supr container repository"

# 2. Build the Docker image natively via Cloud Builds
echo "Building Docker image..."
gcloud builds submit --tag $IMAGE

# 3. Resolve Secret & Environment configuration
# Pass USE_SECRET_MANAGER=true in the shell to enable GCP Secret Manager integration.
if [ "$USE_SECRET_MANAGER" = "true" ]; then
  echo "Integrating GCP Secret Manager for API keys..."
  SECRET_CONFIG="--set-secrets=GEMINI_API_KEY=GEMINI_API_KEY:latest,APP_PASSWORD=APP_PASSWORD:latest"
  ENV_CONFIG="--update-env-vars=NODE_ENV=production"
else
  echo "Injecting keys from active shell environment variables..."
  SECRET_CONFIG=""
  ENV_CONFIG="--update-env-vars=GEMINI_API_KEY=$GEMINI_API_KEY,NODE_ENV=production,APP_PASSWORD=$APP_PASSWORD"
fi

# 4. Deploy to Cloud Run (Gen2)
# Note: You must manually create the GCS bucket for FUSE before running this for state persistence.
# gcloud storage buckets create gs://$PROJECT_ID-supr-state --location=$REGION
echo "Deploying to Cloud Run..."
gcloud run deploy $SERVICE_NAME \
  --image $IMAGE \
  --region $REGION \
  --allow-unauthenticated \
  --memory 2Gi \
  --cpu 2 \
  --concurrency 80 \
  --max-instances 1 \
  --no-cpu-throttling \
  --execution-environment gen2 \
  --add-volume=name=supr-state,type=cloud-storage,bucket=$PROJECT_ID-supr-state \
  --add-volume-mount=volume=supr-state,mount-path=/app/.agents \
  --add-volume-mount=volume=supr-state,mount-path=/app/supr_workspaces \
  $SECRET_CONFIG \
  $ENV_CONFIG

echo "Deployment completed successfully!"
