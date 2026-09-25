#!/usr/bin/env bash
# Play on the local Wi-Fi: open the printed address (or scan the QR code) on the iPhone / tablet.
cd "$(dirname "$0")"
PY=python3
[ -x .venv/bin/python ] && PY=.venv/bin/python
exec "$PY" tools/serve.py "${1:-8765}"
