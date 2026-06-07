#!/usr/bin/env bash
set -euo pipefail

PROJECT_ID="${PROJECT_ID:-$(gcloud config get-value project)}"
REGION="${REGION:-us-central1}"
ENVIRONMENT="${ENVIRONMENT:-staging}"
IMAGE="${IMAGE:-$REGION-docker.pkg.dev/$PROJECT_ID/supr/supr:$(git rev-parse --short HEAD)}"
STATE_BUCKET="${STATE_BUCKET:-$PROJECT_ID-supr-terraform-state}"

terraform -chdir=terraform init -backend-config="bucket=$STATE_BUCKET"
terraform -chdir=terraform validate
terraform -chdir=terraform apply \
  -target=google_artifact_registry_repository.supr \
  -target=google_secret_manager_secret.secrets \
  -target=google_sql_database_instance.postgres \
  -target=google_sql_database.supr \
  -var="project_id=$PROJECT_ID" \
  -var="region=$REGION" \
  -var="environment=$ENVIRONMENT" \
  -var="image=$IMAGE"

if [[ "${SKIP_IMAGE_BUILD:-false}" != "true" ]]; then
  gcloud builds submit --tag "$IMAGE" --project="$PROJECT_ID"
fi

required_secrets=(DB_PASSWORD APP_PASSWORD AUTH_SECRET)
if [[ "${TF_VAR_enable_gemini:-false}" == "true" ]]; then required_secrets+=(GEMINI_API_KEY); fi
if [[ "${TF_VAR_enable_telegram:-false}" == "true" ]]; then required_secrets+=(TELEGRAM_BOT_TOKEN TELEGRAM_WEBHOOK_SECRET); fi
if [[ "${TF_VAR_enable_github:-false}" == "true" ]]; then required_secrets+=(GITHUB_TOKEN); fi

for secret_id in "${required_secrets[@]}"; do
  if ! gcloud secrets versions describe latest --secret="$secret_id" --project="$PROJECT_ID" >/dev/null 2>&1; then
    echo "Secret Manager secret $secret_id has no accessible latest version. Provision it outside Terraform before deployment."
    exit 1
  fi
done

if ! gcloud sql users list --instance=supr-postgres --project="$PROJECT_ID" --filter='name=supr' --format='value(name)' | grep -qx supr; then
  echo "Cloud SQL user supr is missing. Provision its password outside Terraform before deployment."
  exit 1
fi

terraform -chdir=terraform apply \
  -var="project_id=$PROJECT_ID" \
  -var="region=$REGION" \
  -var="environment=$ENVIRONMENT" \
  -var="image=$IMAGE"

WEB_URL="$(terraform -chdir=terraform output -raw web_url)"
if [[ "${SKIP_ACCEPTANCE:-false}" != "true" ]]; then
  node scripts/staging-acceptance.mjs \
    --url "$WEB_URL" \
    --environment "$ENVIRONMENT" \
    --revision "$(git rev-parse --short HEAD)" \
    --output "release-evidence/${ENVIRONMENT}-acceptance.json"
fi

echo "Supr web and worker services deployed through Terraform."
