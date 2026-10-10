#!/usr/bin/env bash
# One-time project setup: APIs, Artifact Registry, service account, secrets, firewall.
# Usage: ./deploy/01-setup-gcp.sh
set -euo pipefail
cd "$(dirname "$0")"; source ./config.env
gcloud config set project "$PROJECT_ID" >/dev/null

echo "==> Enabling APIs"
gcloud services enable run.googleapis.com artifactregistry.googleapis.com cloudbuild.googleapis.com \
  compute.googleapis.com secretmanager.googleapis.com iap.googleapis.com

echo "==> Artifact Registry"
gcloud artifacts repositories describe "$REPO" --location "$REGION" >/dev/null 2>&1 || \
  gcloud artifacts repositories create "$REPO" --repository-format=docker --location "$REGION"

echo "==> Cloud Build permissions (new projects build as the Compute default service account)"
PN=$(gcloud projects describe "$PROJECT_ID" --format='value(projectNumber)')
for role in roles/artifactregistry.writer roles/logging.logWriter roles/storage.objectViewer; do
  gcloud projects add-iam-policy-binding "$PROJECT_ID" --member "serviceAccount:${PN}-compute@developer.gserviceaccount.com" \
    --role "$role" --condition=None >/dev/null || true
done

echo "==> Runtime service account for Cloud Run (least privilege: read secrets only)"
SA="health-run@${PROJECT_ID}.iam.gserviceaccount.com"
gcloud iam service-accounts describe "$SA" >/dev/null 2>&1 || \
  gcloud iam service-accounts create health-run --display-name "health demo Cloud Run"

new_secret() { # name, value
  if gcloud secrets describe "$1" >/dev/null 2>&1; then echo "   $1 exists, keeping"; else
    printf '%s' "$2" | gcloud secrets create "$1" --data-file=- --replication-policy=automatic >/dev/null; echo "   created $1"; fi
  gcloud secrets add-iam-policy-binding "$1" --member "serviceAccount:$SA" --role roles/secretmanager.secretAccessor >/dev/null
}

echo "==> Secrets (generated ones are random; nothing is printed)"
new_secret jwt-secret "$(openssl rand -hex 32)"
new_secret redis-password "$(openssl rand -hex 24)"
new_secret otel-ingest-token "$(openssl rand -hex 24)"
if ! gcloud secrets describe mongo-uri >/dev/null 2>&1; then
  read -rsp "Paste MongoDB Atlas connection string (mongodb+srv://...): " MONGO; echo
  new_secret mongo-uri "$MONGO"
else new_secret mongo-uri unused; fi
if ! gcloud secrets describe google-client-id >/dev/null 2>&1; then
  read -rp "Google OAuth Client ID (xxx.apps.googleusercontent.com): " GCID
  new_secret google-client-id "$GCID"
else new_secret google-client-id unused; fi

echo "==> Firewall: Cloud Run (Direct VPC egress from $SUBNET) -> VM Redis 6379 and OTLP 4318"
RANGE=$(gcloud compute networks subnets describe "$SUBNET" --region "$REGION" --format='value(ipCidrRange)')
gcloud compute firewall-rules describe allow-run-to-obs >/dev/null 2>&1 || \
  gcloud compute firewall-rules create allow-run-to-obs --network "$NETWORK" --direction INGRESS \
    --allow tcp:6379,tcp:4318 --source-ranges "$RANGE" --target-tags obs
echo "==> Firewall: IAP tunnel only (no public Grafana/Jaeger ports)"
gcloud compute firewall-rules describe allow-iap-to-obs >/dev/null 2>&1 || \
  gcloud compute firewall-rules create allow-iap-to-obs --network "$NETWORK" --direction INGRESS \
    --allow tcp:22,tcp:3000,tcp:9090,tcp:16686 --source-ranges 35.235.240.0/20 --target-tags obs

echo "Done. Next: ./deploy/02-setup-vm.sh"
