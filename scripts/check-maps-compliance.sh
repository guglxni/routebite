#!/usr/bin/env bash
# AI-DLC / Google Maps Platform agent-skills compliance gate.
# Grounded in https://github.com/googlemaps/agent-skills (CF + deprecation table).
#
# Usage: ./scripts/check-maps-compliance.sh
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

FAIL=0
warn() { echo "WARN: $*"; }
fail() { echo "FAIL: $*"; FAIL=1; }
ok() { echo "OK:   $*"; }

echo "==> Google Maps Platform compliance checks (agent-skills)"

# Legacy JS APIs (disabled / hard-fail for new projects)
if rg -n --glob '!**/node_modules/**' --glob '!**/aidlc-workflows/**' --glob '!**/graphify-out/**' \
  'new google\.maps\.Marker\b|google\.maps\.places\.Autocomplete\b|PlacesService\b|DirectionsService\b|DistanceMatrixService\b|SearchBox\b' \
  apps packages 2>/dev/null; then
  fail "Legacy Maps JS APIs detected (use PlaceAutocompleteElement / Routes API / AdvancedMarkerElement)"
else
  ok "No legacy Maps JS Marker/Autocomplete/Directions/DistanceMatrix usage"
fi

# Client-side REST CORS trap (CF1) — browser must not fetch routes/places REST
if rg -n --glob 'apps/web/**/*.{ts,tsx}' \
  'routes\.googleapis\.com|areainsights\.googleapis\.com|places\.googleapis\.com/v1' \
  apps/web 2>/dev/null; then
  fail "Client-side Google REST endpoints detected (CORS trap — proxy via apps/api)"
else
  ok "No client-side Google Maps REST calls (server proxy pattern)"
fi

# Hardcoded API keys in source (not .env)
if rg -n --glob '!**/node_modules/**' --glob '!**/.env' --glob '!**/.env.*' \
  'AIza[0-9A-Za-z_-]{20,}' apps packages scripts 2>/dev/null; then
  fail "Possible hardcoded Google API key in source"
else
  ok "No hardcoded AIza* keys in source trees"
fi

# Places UI Kit / Maps JS loader: region + language (CF10)
if [[ -f apps/web/src/lib/google-maps-loader.ts ]]; then
  if rg -q 'region[=:].*IN|params\.set\(["'\'']region["'\''],\s*["'\'']IN["'\'']\)' apps/web/src/lib/google-maps-loader.ts && \
     rg -q 'language[=:].*en|params\.set\(["'\'']language["'\''],\s*["'\'']en["'\'']\)' apps/web/src/lib/google-maps-loader.ts; then
    ok "Maps JS loader sets language/region for India"
  else
    fail "Maps JS loader missing language=en / region=IN (CF10)"
  fi
fi

# Agent skill present for governance
if [[ -f .agents/skills/google-maps-platform/SKILL.md ]]; then
  ok "google-maps-platform agent skill installed (.agents/skills)"
else
  warn "google-maps-platform skill missing — run: npx skills add googlemaps/agent-skills"
fi

# Env examples document key split
if rg -q 'VITE_GOOGLE_MAPS_API_KEY' apps/web/.env.example && \
   rg -q 'GOOGLE_MAPS_API_KEY' apps/api/.env.example; then
  ok "Env examples document client vs server Maps keys"
else
  fail "Missing Maps key docs in .env.example files"
fi

echo ""
if [[ "$FAIL" -ne 0 ]]; then
  echo "Compliance gate FAILED"
  exit 1
fi
echo "Compliance gate PASSED"
exit 0
