#!/usr/bin/env bash
# Lets GitHub Actions deploy to this project WITHOUT a service-account key.
# Workload Identity Federation: GitHub gives each workflow run a short-lived OIDC token,
# Google trusts tokens only from the repo below, and swaps them for short-lived credentials.
# Usage: ./deploy/04-setup-github-ci.sh            (safe to re-run)
set -euo pipefail
cd "$(dirname "$0")"; source ./config.env
GITHUB_REPO=${GITHUB_REPO:-panjasa/health-log-demo}
gcloud config set project "$PROJECT_ID" >/dev/null
PN=$(gcloud projects describe "$PROJECT_ID" --format='value(projectNumber)')
SA_NAME=gha-deployer
SA="$SA_NAME@$PROJECT_ID.iam.gserviceaccount.com"

echo "==> APIs for keyless auth"
gcloud services enable iamcredentials.googleapis.com sts.googleapis.com

echo "==> Deployer service account ($SA)"
gcloud iam service-accounts describe "$SA" >/dev/null 2>&1 || \
  gcloud iam service-accounts create "$SA_NAME" --display-name "GitHub Actions deployer"
# run.admin: deploy + switch traffic; cloudbuild + storage: gcloud builds submit uploads source;
# viewer: lets gcloud stream build logs; serviceAccountUser: deploy as health-run and build as the compute SA.
for role in roles/run.admin roles/cloudbuild.builds.editor roles/storage.admin roles/viewer \
            roles/iam.serviceAccountUser roles/artifactregistry.writer roles/serviceusage.serviceUsageConsumer; do
  gcloud projects add-iam-policy-binding "$PROJECT_ID" --member "serviceAccount:$SA" --role "$role" \
    --condition=None >/dev/null
done

echo "==> Workload Identity pool + GitHub provider (only $GITHUB_REPO is trusted)"
gcloud iam workload-identity-pools describe github --location global >/dev/null 2>&1 || \
  gcloud iam workload-identity-pools create github --location global --display-name "GitHub Actions"
gcloud iam workload-identity-pools providers describe github-provider --location global \
  --workload-identity-pool github >/dev/null 2>&1 || \
  gcloud iam workload-identity-pools providers create-oidc github-provider --location global \
    --workload-identity-pool github --display-name "GitHub" \
    --issuer-uri "https://token.actions.githubusercontent.com" \
    --attribute-mapping "google.subject=assertion.sub,attribute.repository=assertion.repository,attribute.ref=assertion.ref" \
    --attribute-condition "assertion.repository=='$GITHUB_REPO'"

gcloud iam service-accounts add-iam-policy-binding "$SA" --role roles/iam.workloadIdentityUser \
  --member "principalSet://iam.googleapis.com/projects/$PN/locations/global/workloadIdentityPools/github/attribute.repository/$GITHUB_REPO" \
  >/dev/null

echo
echo "Done. These values are already in .github/workflows/deploy.yml (they are not secrets):"
echo "  workload_identity_provider: projects/$PN/locations/global/workloadIdentityPools/github/providers/github-provider"
echo "  service_account:            $SA"
echo "Push to main (or re-run the workflow in GitHub > Actions) to deploy."
