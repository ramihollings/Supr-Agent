#!/bin/bash
set -e

# Configuration
REGION="us-central1"
PROJECT_ID=$(gcloud config get-value project)

if [ -z "$PROJECT_ID" ]; then
  echo "Error: No active GCP project configured. Run 'gcloud config set project PROJECT_ID' first."
  exit 1
fi

echo "=========================================================="
echo "Starting GCP Provisioning for Supr on Project: $PROJECT_ID"
echo "=========================================================="

# 1. Enable Required APIs
echo "Enabling required Google Cloud APIs..."
gcloud services enable \
  container.googleapis.com \
  sqladmin.googleapis.com \
  secretmanager.googleapis.com \
  storage.googleapis.com \
  run.googleapis.com \
  firebase.googleapis.com \
  firebasehosting.googleapis.com \
  artifactregistry.googleapis.com \
  cloudbuild.googleapis.com \
  --project=$PROJECT_ID

# 2. Create Cloud Storage (GCS) Bucket for agent memories/archives
echo "Creating Google Cloud Storage bucket..."
BUCKET_NAME="$PROJECT_ID-supr-state"
if gcloud storage buckets describe gs://$BUCKET_NAME >/dev/null 2>&1; then
  echo "Bucket gs://$BUCKET_NAME already exists."
else
  gcloud storage buckets create gs://$BUCKET_NAME --location=$REGION --project=$PROJECT_ID
  echo "Created bucket gs://$BUCKET_NAME"
fi

# 3. Create Cloud SQL (PostgreSQL) Instance
echo "Creating Cloud SQL PostgreSQL instance (supr-postgres)..."
# Using a lightweight db-custom-1-3840 or shared db-f1-micro tier for cost efficiency
PG_INSTANCE="supr-postgres"
PG_PASSWORD=$(openssl rand -hex 16)

if gcloud sql instances describe $PG_INSTANCE --project=$PROJECT_ID >/dev/null 2>&1; then
  echo "Cloud SQL instance $PG_INSTANCE already exists."
else
  gcloud sql instances create $PG_INSTANCE \
    --database-version=POSTGRES_15 \
    --tier=db-f1-micro \
    --region=$REGION \
    --project=$PROJECT_ID
  
  # Set root password
  gcloud sql users set-password postgres \
    --instance=$PG_INSTANCE \
    --password=$PG_PASSWORD \
    --project=$PROJECT_ID
    
  # Create supr database
  gcloud sql databases create supr \
    --instance=$PG_INSTANCE \
    --project=$PROJECT_ID
fi

# Retrieve Cloud SQL IP / Connection String
PG_IP=$(gcloud sql instances describe $PG_INSTANCE --format="value(ipAddresses[0].ipAddress)" --project=$PROJECT_ID)
DATABASE_URL="postgresql://postgres:$PG_PASSWORD@$PG_IP/supr"

# 4. Configure Cloud Secret Manager
echo "Configuring Cloud Secret Manager..."
create_secret() {
  SECRET_NAME=$1
  SECRET_VAL=$2
  
  if gcloud secrets describe $SECRET_NAME --project=$PROJECT_ID >/dev/null 2>&1; then
    echo "Secret $SECRET_NAME already exists."
  else
    gcloud secrets create $SECRET_NAME --replication-policy="automatic" --project=$PROJECT_ID
    echo -n "$SECRET_VAL" | gcloud secrets versions add $SECRET_NAME --data-file=- --project=$PROJECT_ID
    echo "Created and seeded secret: $SECRET_NAME"
  fi
}

create_secret "DATABASE_URL" "$DATABASE_URL"

# Ask user for Gemini API Key if not already in env
if [ -z "$GEMINI_API_KEY" ]; then
  read -p "Enter your GEMINI_API_KEY (leave blank if you'll add it to Secret Manager manually later): " USER_GEMINI_KEY
  if [ -n "$USER_GEMINI_KEY" ]; then
    create_secret "GEMINI_API_KEY" "$USER_GEMINI_KEY"
  fi
else
  create_secret "GEMINI_API_KEY" "$GEMINI_API_KEY"
fi

# Set a secure default App Password for Session auth
APP_PW=$(openssl rand -hex 12)
create_secret "APP_PASSWORD" "$APP_PW"

AUTH_SECRET=$(openssl rand -hex 32)
create_secret "AUTH_SECRET" "$AUTH_SECRET"

# 5. Create GKE Autopilot Cluster with gVisor agent sandboxing enabled
echo "Creating GKE Autopilot Cluster (supr-cluster)..."
if gcloud container clusters describe supr-cluster --region=$REGION --project=$PROJECT_ID >/dev/null 2>&1; then
  echo "GKE Cluster supr-cluster already exists."
else
  # --enable-agent-sandbox activates gVisor runsc kernel isolation on Autopilot
  gcloud beta container clusters create-auto supr-cluster \
    --region=$REGION \
    --enable-agent-sandbox \
    --project=$PROJECT_ID
fi

# Get credentials for kubectl
gcloud container clusters get-credentials supr-cluster --region=$REGION --project=$PROJECT_ID

# Create Kubernetes Secret matching local Secret Manager values
echo "Configuring Kubernetes secrets in GKE cluster..."
kubectl create namespace supr --dry-run=client -o yaml | kubectl apply -f -
kubectl create secret generic supr-secrets \
  --namespace=supr \
  --from-literal=DATABASE_URL="$DATABASE_URL" \
  --from-literal=GEMINI_API_KEY="${GEMINI_API_KEY:-change-me-later}" \
  --from-literal=APP_PASSWORD="$APP_PW" \
  --from-literal=AUTH_SECRET="$AUTH_SECRET" \
  --dry-run=client -o yaml | kubectl apply -f -

# 6. Set up Cloud Run + Firebase Hosting (Frontend)
echo "Setting up Artifact Registry for container builds..."
gcloud artifacts repositories describe supr-repo --location=$REGION --project=$PROJECT_ID >/dev/null 2>&1 || \
  gcloud artifacts repositories create supr-repo \
    --repository-format=docker \
    --location=$REGION \
    --project=$PROJECT_ID \
    --description="Supr container repository"

IMAGE="$REGION-docker.pkg.dev/$PROJECT_ID/supr-repo/supr-agent"
echo "Building Supr container image..."
gcloud builds submit --tag $IMAGE --project=$PROJECT_ID

echo "Deploying to Cloud Run..."
gcloud run deploy supr-agent \
  --image $REGION-docker.pkg.dev/$PROJECT_ID/supr-repo/supr-agent \
  --region $REGION \
  --project $PROJECT_ID \
  --allow-unauthenticated \
  --set-env-vars="NODE_ENV=production" \
  --set-secrets="DATABASE_URL=DATABASE_URL:latest,GEMINI_API_KEY=GEMINI_API_KEY:latest,APP_PASSWORD=APP_PASSWORD:latest,AUTH_SECRET=AUTH_SECRET:latest" \
  --project=$PROJECT_ID

echo "=========================================================="
echo "GCP Provisioning and Deployment Completed Successfully!"
echo "Database URL configured."
echo "Secure GKE Autopilot cluster is online with gVisor."
echo "Frontend is live on Cloud Run."
echo "Next step: Initialize Firebase Hosting mapping by running:"
echo "  firebase deploy --only hosting"
echo "=========================================================="
