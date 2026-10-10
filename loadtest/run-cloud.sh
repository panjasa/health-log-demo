#!/usr/bin/env bash
# Runs a k6 test against the deployed API.
#   ./loadtest/run-cloud.sh smoke | spike | waiting-room   [extra k6 args]
# Tokens are signed with the real JWT secret, read from Secret Manager,
# written to a temp file and deleted afterwards.
set -euo pipefail
cd "$(dirname "$0")"; source ../deploy/config.env
TEST=${1:-smoke}; shift || true
API_URL=$(gcloud run services describe "$API_SERVICE" --region "$REGION" --project "$PROJECT_ID" --format='value(status.url)')
TOK=$(mktemp); trap 'rm -f "$TOK"' EXIT
( cd ../api && [ -d node_modules ] || npm ci --silent )
JWT_SECRET=$(gcloud secrets versions access latest --secret jwt-secret --project "$PROJECT_ID") \
  node ../api/scripts/make-tokens.mjs 500 > "$TOK"
k6 run -e API_URL="$API_URL" -e TOKENS_FILE="$TOK" "$@" "$TEST.js"
