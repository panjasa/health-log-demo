#!/usr/bin/env bash
# Opens Grafana (localhost:3001), Jaeger (localhost:16686) and Prometheus (localhost:9090)
# through an IAP tunnel. Nothing is exposed to the internet. Ctrl+C to close.
set -euo pipefail
cd "$(dirname "$0")"; source ./config.env
echo "Grafana http://localhost:3001  Jaeger http://localhost:16686  Prometheus http://localhost:9090"
gcloud compute ssh "$VM_NAME" --zone "$ZONE" --project "$PROJECT_ID" --tunnel-through-iap -- \
  -N -L 3001:localhost:3000 -L 16686:localhost:16686 -L 9090:localhost:9090
