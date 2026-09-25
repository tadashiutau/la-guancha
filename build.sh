#!/usr/bin/env bash
# Copy only what the game needs into dist/ (about 2 MB) and zip it for any static host.
set -e
cd "$(dirname "$0")"
rm -rf dist && mkdir -p dist/data
cp -r index.html manifest.webmanifest icon*.png js vendor dist/
cp data/world.json data/terrain_h.png data/terrain_c.png dist/data/
touch dist/.nojekyll
rm -f la-guancha.zip && (cd dist && zip -qr ../la-guancha.zip .)
echo "dist/ listo ($(du -sh dist | cut -f1)) · la-guancha.zip creado"
