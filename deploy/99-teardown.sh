#!/usr/bin/env bash
# Stops everything that costs money. Secrets and images are kept so you can redeploy.
set -euo pipefail
cd "$(dirname "$0")"; source ./config.env
gcloud config set project "$PROJECT_ID" >/dev/null
read -rp "Delete Cloud Run services and VM $VM_NAME in $PROJECT_ID? [y/N] " ok
[ "$ok" = y ] || exit 0
gcloud run services delete "$API_SERVICE" --region "$REGION" --quiet || true
gcloud run services delete "$WEB_SERVICE" --region "$REGION" --quiet || true
gcloud compute instances delete "$VM_NAME" --zone "$ZONE" --quiet || true
echo "Done. Cloud Run scales to zero on its own; the VM was the part that billed every hour."
