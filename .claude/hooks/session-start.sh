#!/bin/bash
# SessionStart hook — instala dependencias para que tests, typecheck y builds
# funcionen en sesiones de Claude Code on the web. Idempotente.
set -euo pipefail

ROOT="${CLAUDE_PROJECT_DIR:-$(cd "$(dirname "$0")/../.." && pwd)}"

echo "[trazza] instalando dependencias de la API…"
(cd "$ROOT/apps/api" && npm install --no-audit --no-fund)

echo "[trazza] instalando dependencias del Web…"
(cd "$ROOT/apps/web" && npm install --no-audit --no-fund)

echo "[trazza] dependencias listas."
