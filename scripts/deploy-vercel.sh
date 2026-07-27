#!/usr/bin/env bash
# Deploy apps/web static build to the routebite Vercel project (never auto-create from folder name).
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
WEB="$ROOT/apps/web"
DIST="$WEB/dist"
PROJECT="${VERCEL_PROJECT:-routebite}"

cd "$WEB"
bun run build
cp "$WEB/vercel.json" "$DIST/vercel.json"

# Vite wipes dist/; restore project link so CLI does not invent a "dist" project.
mkdir -p "$DIST/.vercel"
if [[ -f "$WEB/.vercel/project.json" ]]; then
  cp "$WEB/.vercel/project.json" "$DIST/.vercel/project.json"
  cp "$WEB/.vercel/README.txt" "$DIST/.vercel/README.txt" 2>/dev/null || true
else
  (cd "$DIST" && vercel link --yes --project "$PROJECT")
  mkdir -p "$WEB/.vercel"
  cp "$DIST/.vercel/project.json" "$WEB/.vercel/project.json"
fi

cd "$DIST"
vercel deploy --prod --yes --project "$PROJECT"
