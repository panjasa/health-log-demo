#!/usr/bin/env bash
# Builds both images with Cloud Build and deploys them to Cloud Run.
# Safe to re-run. Usage: ./deploy/03-deploy.sh
set -euo pipefail
cd "$(dirname "$0")"; source ./config.env
gcloud config set project "$PROJECT_ID" >/dev/null
TAG=$(git rev-parse --short HEAD 2>/dev/null || date +%Y%m%d%H%M%S)
APP_VERSION=$(tr -d '[:space:]' < ../VERSION 2>/dev/null || echo dev)
echo "==> Version v$APP_VERSION ($TAG)"
REG="$REGION-docker.pkg.dev/$PROJECT_ID/$REPO"
SA="health-run@${PROJECT_ID}.iam.gserviceaccount.com"
VM_IP=$(gcloud compute instances describe "$VM_NAME" --zone "$ZONE" --format='value(networkInterfaces[0].networkIP)')

echo "==> Build images ($TAG) with Cloud Build"
gcloud builds submit ../api --tag "$REG/api:$TAG" --quiet
gcloud builds submit ../web --tag "$REG/web:$TAG" --quiet

echo "==> Deploy API"
# Direct VPC egress: private traffic (Redis, OTLP on the VM) goes through the VPC,
# everything else (MongoDB Atlas, Google) goes out to the internet as usual.
gcloud run deploy "$API_SERVICE" --region "$REGION" --image "$REG/api:$TAG" \
  --service-account "$SA" --allow-unauthenticated --port 8080 \
  --cpu 1 --memory 512Mi --concurrency 80 --min-instances 0 --max-instances "$MAX_INSTANCES" \
  --network "$NETWORK" --subnet "$SUBNET" --vpc-egress private-ranges-only \
  --set-env-vars "REDIS_URL=redis://$VM_IP:6379,OTEL_EXPORTER_OTLP_ENDPOINT=http://$VM_IP:4318,GOOGLE_CLOUD_PROJECT=$PROJECT_ID,WAITING_ROOM_ENABLED=true,WAITING_ROOM_ADMIT_PER_SEC=$WAITING_ROOM_ADMIT_PER_SEC,RATE_LIMIT_PER_MIN=$RATE_LIMIT_PER_MIN,DEV_LOGIN=false,MONGO_POOL=5,APP_VERSION=$APP_VERSION,GIT_SHA=$TAG" \
  --set-secrets "MONGO_URI=mongo-uri:latest,JWT_SECRET=jwt-secret:latest,REDIS_PASSWORD=redis-password:latest,OTEL_INGEST_TOKEN=otel-ingest-token:latest,GOOGLE_CLIENT_ID=google-client-id:latest" \
  --quiet
API_URL=$(gcloud run services describe "$API_SERVICE" --region "$REGION" --format='value(status.url)')

echo "==> Health probes (startup -> /readyz, liveness -> /healthz)"
gcloud run services update "$API_SERVICE" --region "$REGION" --quiet \
  --startup-probe "httpGet.path=/readyz,httpGet.port=8080,periodSeconds=5,timeoutSeconds=3,failureThreshold=12" \
  --liveness-probe "httpGet.path=/healthz,httpGet.port=8080,periodSeconds=15,timeoutSeconds=3" \
  || echo "   (probe flags not supported by this gcloud version; update gcloud with 'gcloud components update')"

echo "==> Deploy Web"
gcloud run deploy "$WEB_SERVICE" --region "$REGION" --image "$REG/web:$TAG" \
  --service-account "$SA" --allow-unauthenticated --port 8080 \
  --cpu 1 --memory 512Mi --min-instances 0 --max-instances 5 \
  --set-env-vars "API_URL=$API_URL,APP_VERSION=$APP_VERSION,GIT_SHA=$TAG" --set-secrets "GOOGLE_CLIENT_ID=google-client-id:latest" --quiet
WEB_URL=$(gcloud run services describe "$WEB_SERVICE" --region "$REGION" --format='value(status.url)')

if [ -n "${ADMIN_EMAILS:-}" ]; then
  echo "==> Admins for /admin/* (ADMIN_EMAILS)"
  # ^|^ = use | as the list delimiter, because the value itself contains commas.
  gcloud run services update "$API_SERVICE" --region "$REGION" --update-env-vars "^|^ADMIN_EMAILS=$ADMIN_EMAILS" --quiet
fi

echo "==> Allow the web origin on the API (CORS)"
gcloud run services update "$API_SERVICE" --region "$REGION" --update-env-vars "WEB_ORIGIN=$WEB_URL" --quiet

echo
echo "Web : $WEB_URL"
echo "API : $API_URL   (try $API_URL/readyz)"
echo
echo "Add to Google OAuth client -> Authorized JavaScript origins: $WEB_URL"
