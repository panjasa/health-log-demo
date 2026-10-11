#!/usr/bin/env bash
# Blue/green on Cloud Run using revisions and traffic tags.
#   ./deploy/bluegreen.sh green api      build + deploy a new revision with 0% traffic, tagged "green"
#   ./deploy/bluegreen.sh promote api    send 100% traffic to green
#   ./deploy/bluegreen.sh rollback api   send 100% back to the previous revision
#   ./deploy/bluegreen.sh status api
# (use "web" instead of "api" for the frontend)
set -euo pipefail
cd "$(dirname "$0")"; source ./config.env
ACTION=${1:?green|promote|rollback|status}; WHICH=${2:-api}
SERVICE=$([ "$WHICH" = web ] && echo "$WEB_SERVICE" || echo "$API_SERVICE")
REG="$REGION-docker.pkg.dev/$PROJECT_ID/$REPO"
gcloud config set project "$PROJECT_ID" >/dev/null

case "$ACTION" in
  green)
    TAG=$(git rev-parse --short HEAD 2>/dev/null || date +%s)-$(date +%H%M%S)
    gcloud builds submit "../$WHICH" --tag "$REG/$WHICH:$TAG" --quiet
    APP_VERSION=$(tr -d '[:space:]' < ../VERSION 2>/dev/null || echo dev)
    gcloud run deploy "$SERVICE" --region "$REGION" --image "$REG/$WHICH:$TAG" --no-traffic --tag green \
      --update-env-vars "APP_VERSION=$APP_VERSION,GIT_SHA=${TAG%%-*}" --quiet
    URL=$(gcloud run services describe "$SERVICE" --region "$REGION" --format='value(status.url)')
    echo "Green revision is live with 0% traffic. Test it at: ${URL/https:\/\//https://green---}"
    [ "$WHICH" = api ] && echo "  curl ${URL/https:\/\//https://green---}/version"
    ;;
  promote)
    gcloud run services update-traffic "$SERVICE" --region "$REGION" --to-tags green=100 --quiet ;;
  rollback)
    PREV=$(gcloud run revisions list --service "$SERVICE" --region "$REGION" --sort-by=~metadata.creationTimestamp --format='value(metadata.name)' | sed -n 2p)
    gcloud run services update-traffic "$SERVICE" --region "$REGION" --to-revisions "$PREV=100" --quiet
    echo "Rolled back to $PREV" ;;
  status) ;;
  *) echo "unknown action"; exit 1 ;;
esac
gcloud run services describe "$SERVICE" --region "$REGION" --format='table(status.traffic[].revisionName,status.traffic[].percent,status.traffic[].tag)'
