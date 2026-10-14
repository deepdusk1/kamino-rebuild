#!/usr/bin/env sh
# Mac / Linux launcher:  ./start.sh
cd "$(dirname "$0")" || exit 1
if ! command -v node >/dev/null 2>&1; then
  echo "Kamino needs Node.js (https://nodejs.org). Install it, then run this again."
  exit 1
fi
exec node start.mjs "$@"
