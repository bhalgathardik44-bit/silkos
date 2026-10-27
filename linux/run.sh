#!/bin/sh
# Run SilkOS from source on a Linux desktop (needs Node.js once, for the first install).
set -e
cd "$(dirname "$0")/.."
RT="${XDG_CACHE_HOME:-$HOME/.cache}/silkos-runtime"
EXE="$RT/node_modules/electron/dist/electron"
if [ ! -x "$EXE" ]; then
  command -v npm >/dev/null || { echo "Install Node.js (LTS) first: https://nodejs.org"; exit 1; }
  echo "First run only: downloading Electron (~100 MB)..."
  mkdir -p "$RT"; echo '{"name":"silkos-runtime","version":"1.0.0","private":true}' > "$RT/package.json"
  (cd "$RT" && npm install electron@33 --no-audit --no-fund)
fi
exec "$EXE" . "$@"
