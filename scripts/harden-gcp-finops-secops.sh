#!/usr/bin/env bash
# RouteBite — GCP FinOps + DevOps + DevSecOps hardening for Maps Platform.
#
# Idempotent-ish: safe to re-run. Defaults target the Maps demo project used for
# local/dev. Override via env vars for other environments.
#
# Usage:
#   export PATH="/opt/homebrew/share/google-cloud-sdk/bin:$PATH"
#   GCP_PROJECT=gmp-demo-project-713039209 \
#   GCP_BILLING_ACCOUNT=01820F-8D7816-3967E8 \
#   ./scripts/harden-gcp-finops-secops.sh
#
# Optional:
#   BUDGET_AMOUNT_INR=415
#   CONTACT_EMAIL=you@example.com
#   API_KEY_UID=<uid>                 # restrict Maps key API targets
#   KEY_ALLOWED_IPS=1.2.3.4,5.6.7.8  # server IP lock (server-side key)
#   KEY_ALLOWED_REFERRERS=http://localhost:3000/*,https://app.example.com/*
#   SKIP_QUOTAS=1
#   SKIP_BUDGET=1
#   ENABLE_BQ_EXPORT=1               # creates BQ dataset + billing export
#   BQ_DATASET=billing_export
#   BQ_LOCATION=asia-south1

set -euo pipefail

need() { command -v "$1" >/dev/null 2>&1 || { echo "Missing: $1" >&2; exit 1; }; }
need gcloud
need python3

PROJECT="${GCP_PROJECT:-gmp-demo-project-713039209}"
BILLING_ACCOUNT="${GCP_BILLING_ACCOUNT:-01820F-8D7816-3967E8}"
BUDGET_AMOUNT_INR="${BUDGET_AMOUNT_INR:-415}"
CONTACT_EMAIL="${CONTACT_EMAIL:-$(gcloud config get-value account 2>/dev/null || true)}"
API_KEY_UID="${API_KEY_UID:-3878f8c1-6028-4faf-bbbf-46ac5835682f}"
SKIP_QUOTAS="${SKIP_QUOTAS:-0}"
SKIP_BUDGET="${SKIP_BUDGET:-0}"
ENABLE_BQ_EXPORT="${ENABLE_BQ_EXPORT:-0}"
BQ_DATASET="${BQ_DATASET:-billing_export}"
BQ_LOCATION="${BQ_LOCATION:-asia-south1}"

export PATH="${PATH}:/opt/homebrew/share/google-cloud-sdk/bin"

echo "==> Project: ${PROJECT}"
gcloud config set project "${PROJECT}" >/dev/null

PROJECT_NUMBER="$(gcloud projects describe "${PROJECT}" --format='value(projectNumber)')"
echo "==> Project number: ${PROJECT_NUMBER}"

# ---------------------------------------------------------------------------
# 1) FinOps — labels (cost allocation)
# ---------------------------------------------------------------------------
echo "==> Applying FinOps labels"
gcloud alpha projects update "${PROJECT}" \
  --update-labels=app=routebite,env=dev,cost-center=maps,owner=aaryan,finops=managed \
  --quiet

# ---------------------------------------------------------------------------
# 2) Ops APIs (logging / monitoring / asset / contacts)
# ---------------------------------------------------------------------------
echo "==> Enabling ops + security APIs"
gcloud services enable \
  logging.googleapis.com \
  monitoring.googleapis.com \
  cloudasset.googleapis.com \
  essentialcontacts.googleapis.com \
  serviceusage.googleapis.com \
  cloudresourcemanager.googleapis.com \
  billingbudgets.googleapis.com \
  --project="${PROJECT}" --quiet

# ---------------------------------------------------------------------------
# 3) DevSecOps — Cloud Audit Logs (allServices)
# ---------------------------------------------------------------------------
echo "==> Enabling Cloud Audit Logs (ADMIN_READ / DATA_READ / DATA_WRITE)"
TMP="$(mktemp)"
trap 'rm -f "${TMP}"' EXIT
gcloud projects get-iam-policy "${PROJECT}" --format=json > "${TMP}"
python3 - "${TMP}" <<'PY'
import json, sys
path = sys.argv[1]
with open(path) as f:
    pol = json.load(f)
pol["auditConfigs"] = [{
    "service": "allServices",
    "auditLogConfigs": [
        {"logType": "ADMIN_READ"},
        {"logType": "DATA_READ"},
        {"logType": "DATA_WRITE"},
    ],
}]
with open(path, "w") as f:
    json.dump(pol, f, indent=2)
PY
gcloud projects set-iam-policy "${PROJECT}" "${TMP}" --quiet >/dev/null

# ---------------------------------------------------------------------------
# 4) Essential contacts (budget / security / suspension)
# ---------------------------------------------------------------------------
if [[ -n "${CONTACT_EMAIL}" ]]; then
  echo "==> Essential contact: ${CONTACT_EMAIL}"
  gcloud essential-contacts create \
    --email="${CONTACT_EMAIL}" \
    --language=en-US \
    --notification-categories=billing,security,technical,legal,product-updates,suspension \
    --project="${PROJECT}" 2>/dev/null \
    || echo "    (contact already present or insufficient permission — OK)"
fi

# ---------------------------------------------------------------------------
# 5) Budget alerts (INR) — current + forecasted
# ---------------------------------------------------------------------------
if [[ "${SKIP_BUDGET}" != "1" ]]; then
  echo "==> Ensuring monthly budget ${BUDGET_AMOUNT_INR} INR on ${BILLING_ACCOUNT}"
  EXISTING="$(gcloud billing budgets list \
    --billing-account="${BILLING_ACCOUNT}" \
    --filter="displayName:RouteBite" \
    --format='value(name)' 2>/dev/null | head -1 || true)"

  if [[ -n "${EXISTING}" ]]; then
    gcloud billing budgets update "${EXISTING}" \
      --display-name="RouteBite Maps ~USD5/mo (INR${BUDGET_AMOUNT_INR})" \
      --budget-amount="${BUDGET_AMOUNT_INR}INR" \
      --filter-projects="projects/${PROJECT_NUMBER}" \
      --clear-threshold-rules \
      --add-threshold-rule=percent=0.5,basis=current-spend \
      --add-threshold-rule=percent=0.8,basis=current-spend \
      --add-threshold-rule=percent=0.9,basis=current-spend \
      --add-threshold-rule=percent=1.0,basis=current-spend \
      --add-threshold-rule=percent=1.0,basis=forecasted-spend \
      --quiet
  else
    gcloud billing budgets create \
      --billing-account="${BILLING_ACCOUNT}" \
      --display-name="RouteBite Maps ~USD5/mo (INR${BUDGET_AMOUNT_INR})" \
      --budget-amount="${BUDGET_AMOUNT_INR}INR" \
      --filter-projects="projects/${PROJECT_NUMBER}" \
      --threshold-rule=percent=0.5 \
      --threshold-rule=percent=0.8 \
      --threshold-rule=percent=0.9 \
      --threshold-rule=percent=1.0 \
      --threshold-rule=percent=1.0,basis=forecasted-spend \
      --quiet
  fi
fi

# ---------------------------------------------------------------------------
# 6) Consumer quota caps (blast-radius control)
# ---------------------------------------------------------------------------
apply_quota() {
  local service="$1" metric="$2" unit="$3" value="$4"
  gcloud alpha services quota update \
    --service="${service}" \
    --consumer="projects/${PROJECT}" \
    --metric="${metric}" \
    --unit="${unit}" \
    --value="${value}" \
    --force --quiet
  echo "    ${service} ${metric} ${unit} = ${value}"
}

if [[ "${SKIP_QUOTAS}" != "1" ]]; then
  echo "==> Applying consumer quota overrides (dev-safe caps)"
  # Daily
  apply_quota isochrones.googleapis.com isochrones.googleapis.com/requests '1/d/{project}' 100
  apply_quota routes.googleapis.com routes.googleapis.com/compute_routes_requests '1/d/{project}' 300
  apply_quota routes.googleapis.com routes.googleapis.com/compute_route_matrix_elements '1/d/{project}' 500
  apply_quota places.googleapis.com places.googleapis.com/SearchNearbyRequest '1/d/{project}' 200
  apply_quota places.googleapis.com places.googleapis.com/SearchTextRequest '1/d/{project}' 100
  apply_quota places.googleapis.com places.googleapis.com/GetPlaceRequest '1/d/{project}' 200
  apply_quota places.googleapis.com places.googleapis.com/AutocompletePlacesRequest '1/d/{project}' 500
  apply_quota geocoding-backend.googleapis.com geocoding-backend.googleapis.com/billable_default '1/d/{project}' 200
  apply_quota maps-backend.googleapis.com maps-backend.googleapis.com/billable_default '1/d/{project}' 2000
  # Per-minute
  apply_quota isochrones.googleapis.com isochrones.googleapis.com/requests '1/min/{project}' 30
  apply_quota routes.googleapis.com routes.googleapis.com/compute_routes_requests '1/min/{project}' 60
  apply_quota places.googleapis.com places.googleapis.com/SearchNearbyRequest '1/min/{project}' 60
  apply_quota geocoding-backend.googleapis.com geocoding-backend.googleapis.com/billable_default '1/min/{project}' 60
  apply_quota maps-backend.googleapis.com maps-backend.googleapis.com/billable_default '1/min/{project}' 120
fi

# ---------------------------------------------------------------------------
# 7) API key hardening (API targets + optional IP / referrer)
# ---------------------------------------------------------------------------
if [[ -n "${API_KEY_UID}" ]]; then
  KEY_NAME="projects/${PROJECT_NUMBER}/locations/global/keys/${API_KEY_UID}"
  echo "==> Restricting API key ${API_KEY_UID} to Maps surfaces"
  UPDATE_ARGS=(
    --project="${PROJECT}"
    --api-target=service=routes.googleapis.com
    --api-target=service=geocoding-backend.googleapis.com
    --api-target=service=places-backend.googleapis.com
    --api-target=service=places.googleapis.com
    --api-target=service=areainsights.googleapis.com
    --api-target=service=roads.googleapis.com
    --api-target=service=addressvalidation.googleapis.com
    --api-target=service=weather.googleapis.com
    --api-target=service=maps-backend.googleapis.com
    --api-target=service=isochrones.googleapis.com
    --api-target=service=airquality.googleapis.com
    --api-target=service=pollen.googleapis.com
    --api-target=service=routeoptimization.googleapis.com
  )

  if [[ -n "${KEY_ALLOWED_IPS:-}" ]]; then
    # Comma-separated IPs → repeated --allowed-ips
    IFS=',' read -r -a IPS <<< "${KEY_ALLOWED_IPS}"
    for ip in "${IPS[@]}"; do
      UPDATE_ARGS+=(--allowed-ips="${ip}")
    done
    echo "    + server IP restrictions: ${KEY_ALLOWED_IPS}"
  fi

  if [[ -n "${KEY_ALLOWED_REFERRERS:-}" ]]; then
    IFS=',' read -r -a REFS <<< "${KEY_ALLOWED_REFERRERS}"
    for ref in "${REFS[@]}"; do
      UPDATE_ARGS+=(--allowed-referrers="${ref}")
    done
    echo "    + browser referrer restrictions: ${KEY_ALLOWED_REFERRERS}"
  fi

  if [[ -z "${KEY_ALLOWED_IPS:-}" && -z "${KEY_ALLOWED_REFERRERS:-}" ]]; then
    echo "    WARN: no IP/referrer set — key remains application-unrestricted."
    echo "    Set KEY_ALLOWED_IPS (server) or KEY_ALLOWED_REFERRERS (Maps JS)."
    echo "    Prefer separate GOOGLE_MAPS_API_KEY_SERVER / _CLIENT keys."
  fi

  gcloud services api-keys update "${KEY_NAME}" "${UPDATE_ARGS[@]}" --quiet
fi

# ---------------------------------------------------------------------------
# 8) Optional BigQuery billing export (detailed FinOps)
# ---------------------------------------------------------------------------
if [[ "${ENABLE_BQ_EXPORT}" == "1" ]]; then
  echo "==> Enabling BigQuery billing export → ${BQ_DATASET} (${BQ_LOCATION})"
  gcloud services enable bigquery.googleapis.com --project="${PROJECT}" --quiet
  bq --location="${BQ_LOCATION}" mk -d --description="GCP billing export for RouteBite FinOps" "${PROJECT}:${BQ_DATASET}" 2>/dev/null || true
  echo "    Open Billing → Billing export and point Detailed/Standard usage cost"
  echo "    to ${PROJECT}:${BQ_DATASET} (CLI export config requires Billing Admin UI/API)."
  echo "    Docs: https://cloud.google.com/billing/docs/how-to/export-data-bigquery"
fi

# ---------------------------------------------------------------------------
# 9) IAM hygiene reminder (least privilege)
# ---------------------------------------------------------------------------
echo "==> IAM bindings (review for least privilege — Owner is OK for solo hackathon;"
echo "    production should use separate SA roles: maps.user + logging.viewer + monitoring.viewer)"
gcloud projects get-iam-policy "${PROJECT}" \
  --flatten='bindings[].members' \
  --format='table(bindings.role,bindings.members)'

echo ""
echo "Done. FinOps / DevSecOps baseline applied on ${PROJECT}."
echo "Next (manual / CI):"
echo "  • Split server vs client Maps keys; lock referrers + IPs"
echo "  • Rotate any key that ever appeared in chat/logs"
echo "  • Keep closed billing accounts unused; only link open accounts"
echo "  • Re-run with ENABLE_BQ_EXPORT=1 for warehouse-grade cost analytics"
echo "  • Production: replace roles/owner with custom least-privilege SAs"
