#!/usr/bin/env bash
# Enable Google Maps Platform APIs for RouteBite via gcloud CLI.
# Docs: https://developers.google.com/maps/get-started
#
# Usage:
#   GCP_PROJECT=gmp-demo-project-713039209 ./scripts/enable-gcp-maps-apis.sh
#   GCP_PROJECT=your-project-id ./scripts/enable-gcp-maps-apis.sh

set -euo pipefail

PROJECT="${GCP_PROJECT:-gmp-demo-project-713039209}"
BILLING_ACCOUNT="${GCP_BILLING_ACCOUNT:-}"

echo "==> Enabling Maps APIs on project: ${PROJECT}"

CORE_APIS=(
  routes.googleapis.com
  geocoding-backend.googleapis.com
  places-backend.googleapis.com
  places.googleapis.com
  areainsights.googleapis.com
  roads.googleapis.com
  addressvalidation.googleapis.com
  weather.googleapis.com
  isochrones.googleapis.com
  airquality.googleapis.com
  pollen.googleapis.com
  routeoptimization.googleapis.com
  maps-backend.googleapis.com
)

gcloud services enable --project="${PROJECT}" "${CORE_APIS[@]}"

if [[ -n "${BILLING_ACCOUNT}" ]]; then
  echo "==> Linking billing account ${BILLING_ACCOUNT}"
  gcloud billing projects link "${PROJECT}" --billing-account="${BILLING_ACCOUNT}"
else
  echo "==> Skipping billing link (set GCP_BILLING_ACCOUNT to link explicitly)"
fi

echo "==> Enabled services:"
gcloud services list --enabled --project="${PROJECT}" \
  --filter="config.name:routes OR config.name:geocod OR config.name:places OR config.name:roads OR config.name:address OR config.name:areainsights OR config.name:weather OR config.name:isochrones" \
  --format="table(config.name)"

echo ""
echo "==> Next: FinOps + DevSecOps hardening (budgets, quotas, audit logs, key targets):"
echo "  GCP_PROJECT=${PROJECT} GCP_BILLING_ACCOUNT=\$GCP_BILLING_ACCOUNT \\"
echo "    ./scripts/harden-gcp-finops-secops.sh"
echo ""
echo "Done. Propagation may take 1–5 minutes before all APIs respond."
