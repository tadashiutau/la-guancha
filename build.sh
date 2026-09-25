#!/usr/bin/env bash
# Copy only runtime assets into dist/ and zip it for any static host.
set -e
cd "$(dirname "$0")"
rm -rf dist && mkdir -p dist/data dist/assets
cp -r index.html manifest.webmanifest icon*.png js vendor music dist/
cp assets/island-assets.glb assets/moth-lowpoly.glb dist/assets/
cp data/world.json data/terrain_h.png data/terrain_c.jpg dist/data/
touch dist/.nojekyll
rm -f la-guancha.zip && (cd dist && zip -qr ../la-guancha.zip .)
echo "dist/ listo ($(du -sh dist | cut -f1)) · la-guancha.zip creado"
