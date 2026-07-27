#!/usr/bin/env sh
# Runtime entry: mock Swiggy MCP + API (FinOps single container).
set -eu
export SWIGGY_MCP_BASE="${SWIGGY_MCP_BASE:-http://127.0.0.1:8788}"
bun run apps/mock-swiggy/src/index.ts &
MOCK_PID=$!
cleanup() {
  kill "$MOCK_PID" 2>/dev/null || true
}
trap cleanup EXIT INT TERM
# Give mock a moment to bind
sleep 1
exec bun run apps/api/src/index.ts
