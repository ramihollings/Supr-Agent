import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const ci = readFileSync('.github/workflows/ci.yml', 'utf8');
const staging = readFileSync('.github/workflows/deploy-staging.yml', 'utf8');
const deployScript = readFileSync('deploy.sh', 'utf8');
const dockerfile = readFileSync('Dockerfile', 'utf8');
const terraform = readFileSync('terraform/main.tf', 'utf8');
const terraformVariables = readFileSync('terraform/variables.tf', 'utf8');
const schemaGate = readFileSync('scripts/postgres-schema-gate.ts', 'utf8');
const durableExecutions = readFileSync('lib/runtime/durable-executions.ts', 'utf8');

test('CI builds and blocks on critical or high production container vulnerabilities', () => {
  assert.match(ci, /production-image:/);
  assert.match(ci, /needs: \[verify, postgres\]/);
  assert.match(ci, /docker build --tag supr:\$\{\{ github\.sha \}\} \./);
  assert.match(ci, /aquasecurity\/trivy-action@v0\.36\.0/);
  assert.match(ci, /severity: CRITICAL,HIGH/);
  assert.match(ci, /exit-code: '1'/);
  assert.match(ci, /github\/codeql-action\/upload-sarif@v4/);
  assert.match(dockerfile, /rm -rf \/usr\/local\/lib\/node_modules\/npm/);
  assert.match(dockerfile, /playwright-core\/browsers\.json/);
});

test('Terraform grants Secret Manager access per secret and service', () => {
  assert.match(terraform, /web_secret_access = toset/);
  assert.match(terraform, /worker_secret_access = toset/);
  assert.match(terraform, /google_secret_manager_secret_iam_member" "web_secret_accessor/);
  assert.match(terraform, /google_secret_manager_secret_iam_member" "worker_secret_accessor/);
  assert.doesNotMatch(terraform, /google_project_iam_member" "secret_accessor/);
});

test('Terraform state never receives production secret values', () => {
  assert.doesNotMatch(terraform, /google_secret_manager_secret_version/);
  assert.doesNotMatch(terraform, /password\s*=\s*var\.db_password/);
  assert.doesNotMatch(terraformVariables, /variable "(db_password|app_password|auth_secret|gemini_api_key|telegram_bot_token|telegram_webhook_secret|github_token)"/);
  assert.doesNotMatch(staging, /TF_VAR_(db_password|app_password|auth_secret|gemini_api_key|telegram_bot_token|telegram_webhook_secret|github_token)/);
  assert.match(staging, /gcloud secrets versions add "\$secret_id" --data-file=-/);
  assert.match(staging, /gcloud sql users set-password supr/);
  assert.match(deployScript, /gcloud secrets versions describe latest/);
  assert.match(deployScript, /gcloud sql users list --instance=supr-postgres/);
});

test('Cloud Run revisions wait for secret IAM and use HTTP health probes', () => {
  assert.match(terraform, /google_secret_manager_secret_iam_member\.worker_secret_accessor/);
  assert.match(terraform, /google_secret_manager_secret_iam_member\.web_secret_accessor/);
  assert.equal((terraform.match(/startup_probe \{/g) || []).length, 2);
  assert.equal((terraform.match(/liveness_probe \{/g) || []).length, 2);
  assert.equal((terraform.match(/path = "\/api\/health\/live"/g) || []).length, 4);
});

test('staging deploy is manual, protected, keyless, and preserves acceptance evidence', () => {
  assert.match(staging, /workflow_dispatch:/);
  assert.match(staging, /environment: staging/);
  assert.match(staging, /ENVIRONMENT: staging/);
  assert.match(staging, /github\.ref != 'refs\/heads\/main'/);
  assert.doesNotMatch(staging, /environment: production|ENVIRONMENT: production/);
  assert.match(staging, /permissions:[\s\S]*id-token: write/);
  assert.match(staging, /google-github-actions\/auth@v3/);
  assert.match(staging, /workload_identity_provider:/);
  assert.doesNotMatch(staging, /credentials_json/);
  assert.match(staging, /run: npm run test:prod/);
  assert.match(staging, /run: npm run test:postgres/);
  assert.match(staging, /docker build --tag supr-staging:\$\{GITHUB_SHA\} \./);
  assert.match(staging, /image-ref: supr-staging:\$\{\{ github\.sha \}\}/);
  assert.match(staging, /docker push "\$STAGING_IMAGE"/);
  assert.match(staging, /-target=google_artifact_registry_repository\.supr/);
  assert.match(staging, /-target=google_secret_manager_secret\.secrets/);
  assert.match(staging, /-target=google_sql_database_instance\.postgres/);
  assert.doesNotMatch(staging, /gcloud artifacts repositories create/);
  assert.match(staging, /IMAGE: \$\{\{ env\.STAGING_IMAGE \}\}/);
  assert.match(staging, /SKIP_IMAGE_BUILD: 'true'/);
  assert.match(staging, /run: \.\/deploy\.sh/);
  assert.match(staging, /SKIP_ACCEPTANCE: 'true'/);
  assert.match(staging, /cloud-sql-proxy\/v2\.20\.0\/cloud-sql-proxy\.linux\.amd64/);
  assert.match(staging, /npm run db:schema:postgres -- --bootstrap-empty/);
  assert.match(staging, /npm run evaluate:durable-runtime -- --output release-evidence\/durable-runtime-evaluation\.json/);
  assert.match(staging, /npm run evaluate:durable-runtime:verify -- --input release-evidence\/durable-runtime-evaluation\.json --environment staging --revision "\$GITHUB_SHA"/);
  assert.match(staging, /npm run staging:accept -- --url "\$SUPR_WEB_URL"/);
  assert.match(staging, /release-evidence\/staging-acceptance\.json/);
  assert.match(staging, /release-evidence\/postgres-schema\.json/);
  assert.match(staging, /release-evidence\/durable-runtime-evaluation\.json/);
});

test('PostgreSQL staging bootstrap never imports the checkout database', () => {
  assert.match(schemaGate, /supr-empty-schema-\$\{randomUUID\(\)\}\.db/);
  assert.match(schemaGate, /env: \{ \.\.\.process\.env, SQLITE_DB_PATH: emptySchemaSource \}/);
});

test('durable dispatch and cancellation transitions are idempotent', () => {
  assert.match(durableExecutions, /-attempt-\$\{execution\.attempt\}/);
  assert.doesNotMatch(durableExecutions, /const dispatchId = crypto\.randomUUID/);
  assert.match(durableExecutions, /export async function cancelExecution/);
  assert.match(durableExecutions, /FOR UPDATE SKIP LOCKED/);
  assert.match(durableExecutions, /WHERE id = \? AND status IN \('queued','running','needs_approval'\)[\s\S]*RETURNING \*/);
});
