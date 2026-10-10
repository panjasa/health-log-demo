#!/usr/bin/env bash
# Creates the observability VM (Redis + OTel Collector + Prometheus + Grafana + Jaeger).
# No public ports: Cloud Run reaches it on its internal IP; you reach Grafana via IAP.
set -euo pipefail
cd "$(dirname "$0")"; source ./config.env
gcloud config set project "$PROJECT_ID" >/dev/null

if ! gcloud compute instances describe "$VM_NAME" --zone "$ZONE" >/dev/null 2>&1; then
  echo "==> Creating VM $VM_NAME ($VM_TYPE)"
  gcloud compute instances create "$VM_NAME" --zone "$ZONE" --machine-type "$VM_TYPE" \
    --network "$NETWORK" --subnet "$SUBNET" --tags obs \
    --image-family debian-12 --image-project debian-cloud --boot-disk-size 20GB \
    --metadata startup-script='#!/bin/bash
if ! command -v docker >/dev/null; then curl -fsSL https://get.docker.com | sh; fi'
  echo "   waiting for Docker to install..."; sleep 90
fi

echo "==> Copying configs"
TMP=$(mktemp -d)
cp -r ../observability "$TMP/"
cp vm/docker-compose.yml "$TMP/"
{
  echo "REDIS_PASSWORD=$(gcloud secrets versions access latest --secret redis-password)"
  echo "OTEL_INGEST_TOKEN=$(gcloud secrets versions access latest --secret otel-ingest-token)"
  echo "GRAFANA_PASSWORD=$(openssl rand -hex 8)"
} > "$TMP/.env"
chmod 600 "$TMP/.env"
gcloud compute ssh "$VM_NAME" --zone "$ZONE" --tunnel-through-iap --command "mkdir -p ~/obs"
gcloud compute scp --zone "$ZONE" --tunnel-through-iap --recurse "$TMP/observability" "$TMP/docker-compose.yml" "$TMP/.env" "$VM_NAME":~/obs/
rm -rf "$TMP"

echo "==> Starting stack"
gcloud compute ssh "$VM_NAME" --zone "$ZONE" --tunnel-through-iap --command "cd ~/obs && sudo docker compose up -d && sudo docker compose ps"
echo
echo "Grafana admin password:"
gcloud compute ssh "$VM_NAME" --zone "$ZONE" --tunnel-through-iap --command "grep GRAFANA_PASSWORD ~/obs/.env | cut -d= -f2"
echo "Next: ./deploy/03-deploy.sh   |  Open dashboards: ./deploy/tunnel.sh"
