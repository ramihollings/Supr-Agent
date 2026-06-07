#!/usr/bin/env bash
set -euo pipefail

PROJECT_ID="${PROJECT_ID:-$(gcloud config get-value project)}"
REGION="${REGION:-us-central1}"
ENVIRONMENT="${ENVIRONMENT:-staging}"
IMAGE="${IMAGE:-$REGION-docker.pkg.dev/$PROJECT_ID/supr/supr:$(git rev-parse --short HEAD)}"
STATE_BUCKET="${STATE_BUCKET:-$PROJECT_ID-supr-terraform-state}"

gcloud artifacts repositories describe supr --location="$REGION" --project="$PROJECT_ID" >/dev/null 2>&1 || \
  gcloud artifacts repositories create supr --repository-format=docker --location="$REGION" --project="$PROJECT_ID"

gcloud builds submit --tag "$IMAGE" --project="$PROJECT_ID"

terraform -chdir=terraform init -backend-config="bucket=$STATE_BUCKET"
terraform -chdir=terraform validate
terraform -chdir=terraform apply \
  -var="project_id=$PROJECT_ID" \
  -var="region=$REGION" \
  -var="environment=$ENVIRONMENT" \
  -var="image=$IMAGE"

echo "Supr web and worker services deployed through Terraform."
