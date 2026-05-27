# Supr. — Google Cloud SaaS Deployment Guide

This guide outlines the step-by-step procedure to transition **Supr.** from a local development workspace into a production-grade SaaS application hosted on **Google Cloud Platform (GCP)**.

---

## Target SaaS Architecture

```mermaid
graph TD
    User([Manager Browser]) --> |HTTPS| LB[Cloud Load Balancer + HTTPS Certificate]
    LB --> |Cloud Armor WAF| Run[Google Cloud Run Next.js Instance]
    Run --> |VPC Connector| SQL[(Cloud SQL PostgreSQL Database)]
    Run --> |Mounted Env| Sec{Google Secret Manager}
    Run --> |HTTPS API| E2B[Secure Ephemeral Agent Sandbox VMs]
```

---

## Step 1: Database Setup (Cloud SQL PostgreSQL)

Because serverless containers auto-scale and recycle, you must replace local SQLite database locks with a robust, managed SQL engine.

1. **Create a PostgreSQL Cloud SQL Instance:**
   ```bash
   gcloud sql instances create supr-postgres \
       --database-version=POSTGRES_15 \
       --tier=db-f1-micro \
       --region=us-central1 \
       --edition=enterprise
   ```
2. **Create the Database and User:**
   ```bash
   gcloud sql databases create supr_saas_db --instance=supr-postgres
   gcloud sql users create supr_admin --instance=supr-postgres --password=YOUR_SECURE_DB_PASSWORD
   ```
3. **Configure Private Network Routing:**
   * In the Google Cloud Console, enable **Private IP** on the database instance.
   * Attach it to your default VPC network. This ensures database connections never travel over the public internet.

---

## Step 2: Configure Serverless VPC Access

To allow Cloud Run to access the private IP of your Cloud SQL database, you must configure a Serverless VPC Access connector.

1. **Create Serverless VPC Connector:**
   ```bash
   gcloud compute networks vpc-access connectors create supr-vpc-connector \
       --network=default \
       --region=us-central1 \
       --range=10.8.0.0/28
   ```
   *(Note: The IP range must be a `/28` subnet that is not already occupied in your VPC network).*

---

## Step 3: Secure Secrets Management (Secret Manager)

Avoid placing raw credentials in code repositories or environment configurations.

1. **Create and Save Secrets in Secret Manager:**
   ```bash
   # Save the Database Connection URI
   echo -n "postgresql://supr_admin:YOUR_SECURE_DB_PASSWORD@PRIVATE_IP_OF_SQL:5432/supr_saas_db" | \
       gcloud secrets create DATABASE_URL --data-file=-

   # Save the Gemini API Key
   echo -n "AIzaSyYourGeminiApiKey" | \
       gcloud secrets create GEMINI_API_KEY --data-file=-

   # Save the App Password
   echo -n "YourSecureAppAccessPassword" | \
       gcloud secrets create APP_PASSWORD --data-file=-

   # Save E2B Sandbox Key (For execution security)
   echo -n "e2b_key_here" | \
       gcloud secrets create E2B_API_KEY --data-file=-
   ```

2. **Grant Read Access to Cloud Run Service Account:**
   Create a dedicated service account identity for Supr.:
   ```bash
   gcloud iam service-accounts create supr-runner-identity \
       --display-name="Supr Cloud Run Service Account"
   ```
   Grant the identity access to read the secrets:
   ```bash
   gcloud secrets add-iam-policy-binding DATABASE_URL \
       --member="serviceAccount:supr-runner-identity@YOUR_PROJECT_ID.iam.gserviceaccount.com" \
       --role="roles/secretmanager.secretAccessor"

   gcloud secrets add-iam-policy-binding GEMINI_API_KEY \
       --member="serviceAccount:supr-runner-identity@YOUR_PROJECT_ID.iam.gserviceaccount.com" \
       --role="roles/secretmanager.secretAccessor"

   gcloud secrets add-iam-policy-binding APP_PASSWORD \
       --member="serviceAccount:supr-runner-identity@YOUR_PROJECT_ID.iam.gserviceaccount.com" \
       --role="roles/secretmanager.secretAccessor"

   gcloud secrets add-iam-policy-binding E2B_API_KEY \
       --member="serviceAccount:supr-runner-identity@YOUR_PROJECT_ID.iam.gserviceaccount.com" \
       --role="roles/secretmanager.secretAccessor"
   ```

---

## Step 4: Containerize & Push (Artifact Registry)

1. **Create Artifact Registry Repository:**
   ```bash
   gcloud artifacts repositories create supr-repo \
       --repository-format=docker \
       --location=us-central1 \
       --description="Supr container registry"
   ```
2. **Build and Tag Container:**
   ```bash
   docker build --platform linux/amd64 -t us-central1-docker.pkg.dev/YOUR_PROJECT_ID/supr-repo/supr-app:latest .
   ```
3. **Push to Registry:**
   ```bash
   gcloud auth configure-docker us-central1-docker.pkg.dev
   docker push us-central1-docker.pkg.dev/YOUR_PROJECT_ID/supr-repo/supr-app:latest
   ```

---

## Step 5: Deploy to Google Cloud Run

Deploy the container instance to Cloud Run, attaching secrets, mounting the VPC connector, and assigning the custom service account identity.

```bash
gcloud run deploy supr-saas-instance \
    --image=us-central1-docker.pkg.dev/YOUR_PROJECT_ID/supr-repo/supr-app:latest \
    --region=us-central1 \
    --service-account=supr-runner-identity@YOUR_PROJECT_ID.iam.gserviceaccount.com \
    --vpc-connector=supr-vpc-connector \
    --set-secrets="DATABASE_URL=DATABASE_URL:latest,GEMINI_API_KEY=GEMINI_API_KEY:latest,APP_PASSWORD=APP_PASSWORD:latest,E2B_API_KEY=E2B_API_KEY:latest" \
    --allow-unauthenticated \
    --port=3001
```

---

## Step 6: Set Up HTTPS Load Balancing & Cloud Armor WAF

Secure the public ingress gate using Cloud Load Balancing and Cloud Armor Web Application Firewall (WAF).

1. **Create a Cloud Armor Security Policy:**
   ```bash
   gcloud compute security-policies create supr-waf-policy \
       --description="Block SQLi, XSS, and exploit probes"
   ```
2. **Add OWASP Core Rules to Cloud Armor:**
   ```bash
   # Block SQL Injection vulnerabilities
   gcloud compute security-policies rules create 1000 \
       --security-policy=supr-waf-policy \
       --expression="evaluatePreconfiguredExpr('sqli-v33-stable')" \
       --action=deny-403 \
       --description="Deny SQL injection rules"

   # Block Cross-Site Scripting (XSS)
   gcloud compute security-policies rules create 1010 \
       --security-policy=supr-waf-policy \
       --expression="evaluatePreconfiguredExpr('xss-v33-stable')" \
       --action=deny-403 \
       --description="Deny XSS rules"
   ```
3. **Configure the Global HTTPS Load Balancer:**
   * Connect your custom domain name (e.g., `app.supr.io`) and request a Google-managed SSL Certificate.
   * Direct traffic to the Cloud Run serverless network endpoint group (NEG).
   * Attach the `supr-waf-policy` security policy directly to the Backend Service.
   * Lock ingress on Cloud Run instance configuration to only allow traffic routed through this Load Balancer.
