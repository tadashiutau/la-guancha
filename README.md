# Chavos en La Guancha

A small Super Mario Odyssey–style 3D exploration game set on the **Paseo Tablado La Guancha** in Ponce, Puerto Rico. It's built from real map data and runs in the browser on iPhone, Android tablets and desktop. The in-game text is Spanish first, with an English toggle.

Collect **28 vejigante masks**, 50 conch shells and lots of chavos. Along the way you can triple jump, backflip, long jump, ground pound, wall jump, dive, swim, and throw your pava (then bounce on it). Find Moth, a black cat in a box at the park, to begin a six-step mystery with marked clues and a final gift.

## Play it

### On your Wi-Fi (fastest)

```bash
./play.sh
```

Open the address it prints (or scan the QR code) on the iPhone or tablet. The device has to be on the same Wi-Fi network.

### Permanent link (GitHub Pages)

The repo root is the game itself, so GitHub Pages serves it directly (Settings → Pages → *Deploy from branch* → `main` / root).

### Any other static host

```bash
./build.sh
```

This creates `dist/` and `la-guancha.zip` (about 6 MB). You can upload either one to Netlify Drop, Cloudflare Pages, etc.

### Put it on the home screen (full screen, like an app)

- **iPhone (Safari):** Share → *Add to Home Screen*
- **Galaxy Tab / Android (Chrome):** ⋮ menu → *Add to Home screen* / *Install app*

## Controls

| | Touch | Keyboard |
|---|---|---|
| Move | left thumb stick (appears where you touch) | WASD / arrows |
| Camera | drag on the right side | mouse drag, Q/R |
| Jump | ⤒ | Space |
| Throw pava | 🎩 | E / J |
| Crouch / ground pound | ⤓ | Shift / K |
| Talk | 💬 button | F |
| Map / pause | II button | M / Esc |

Choose one of three save slots before playing and name your character. A save from an older, incompatible version shows a warning on its slot with a Delete button, so you can start over there. Progress is saved in the browser automatically. The save screen can copy, move, or delete slots; a previous single-slot save moves to the first available slot automatically.

The pause map shows conch progress by area. Trees between the camera and the player fade so they do not hide the route. Moth's mystery has a quest marker at the park to start and a marker on every clue afterward; its progress stays in the selected save slot.

## Generated models

The conch, coin, vejigante mask and crate models in `assets/island-assets.glb` were generated with Higgsfield 3D Jutsu. The chest keeps its original animated lid. Moth's model was generated with Meshy from reference photos supplied by the project owner. `assets/moth-optimized.glb` (17.2 MB) is a reduced copy with baked vertex colors. The game loads `assets/moth-lowpoly.glb` (about 400 KB, 3,500 triangles), a flat-shaded low-poly Moth made from it by `tools/lowpoly_moth.py`: the scan is filled into one solid shape, simplified, and each facet takes the fur color around it. Her green eyes are separate geometry, placed on the face surface when the game loads.

`assets/moth-meshy-original.glb.xz` is a lossless archive of the **untouched original Moth GLB**. Extract it with `xz -dk assets/moth-meshy-original.glb.xz` to compare or try another optimization. Claude is welcome to improve the downsizing while keeping Moth's features and browser performance. The 13 images in `assets/moth-reference/` are the owner's visual references; `IMG_0412.jpg` was uploaded to Meshy for the generation. Repository copies have camera metadata removed. Neither the original archive nor reference images are included in `dist/` or the playable zip.

## Debug mode

Add `?debug` to the address to show frame rate, draw calls and position. Press **V** there for a free camera: WASD or arrows fly, Space up, Shift or C down, hold Alt to go faster, drag the mouse (or Q/R) to look, and V or Esc returns to the player. From the browser console, `G.fly(x, y, z, lookX, lookY, lookZ)` jumps the camera to a spot.

## How the level was made

For a ground-level visual pass, see the [coordinate-tagged La Guancha Street View reference index](references/street-view/README.md). It links to live Google panoramas, with capture dates and corresponding game coordinates for Claude's review.

`tools/fetch.py` downloads the raw data, and `tools/build_world.py` turns it into `data/`:

- **OpenStreetMap** (Overpass): the boardwalk, kiosks, buildings, piers, roads, park, beach and breakwaters
- **USGS 3DEP**: the 1 m bare-earth DEM, plus **LiDAR point clouds** (2024) used for tree positions and heights (1,642 trees) and building heights
- **NOAA NCEI CUDEM** 2022 topobathy: real water depths for the basin (about 9 m deep), reef flat and open sea
- **NAIP 2022** and **Esri World Imagery**: aerial ground outside mapped areas, mini-map reference, roof colors and moored-boat detection. Roads, footpaths, parks, beach, wetlands and parking use crisp game surfaces over the imagery.

Rebuilding the data:

```bash
python3 -m venv --without-pip .venv
python3 -m pip --python .venv/bin/python install numpy rasterio shapely pyproj "laspy[lazrs]" requests pillow scipy qrcode
cd tools && ../.venv/bin/python fetch.py && ../.venv/bin/python build_world.py
```

## Credits

Map data © OpenStreetMap contributors (ODbL). Elevation and LiDAR from USGS 3DEP (public domain). Bathymetry from NOAA NCEI (public domain). Aerial imagery from USDA NAIP (public domain) and Esri World Imagery (Esri, Maxar, Earthstar Geographics). 3D engine: [three.js](https://threejs.org) (MIT).
