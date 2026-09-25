"""Canopy map from the USGS LiDAR: where the real woods are, and how tall.

Writes data/canopy.png, a 2 m grid over the level frame (same orientation as terrain_c.jpg:
north up). Each pixel is the vegetation height in decimeters (0 = open ground), capped at 25 m.
The game fills these areas with extra trees and undergrowth so woods read as woods instead of
a few scattered trees (LiDAR peak detection finds one tree per crown, and misses dense stands).

    .venv/bin/python tools/build_canopy.py
"""
import json

import numpy as np
from PIL import Image, ImageDraw
from scipy import ndimage

from build_world import lidar_grids, W, H
from common import ROOT, X0, Y1

STEP = 2  # meters per output pixel


def main():
    world = json.loads((ROOT / "data/world.json").read_text())
    veg, bld, dtm = lidar_grids()
    chm = np.nan_to_num(veg - dtm, nan=0).clip(0, 25)

    # buildings: OSM footprints plus the flat-roofed blobs the survey also left as class 1
    bmask = Image.new("L", (W, H), 0)
    d = ImageDraw.Draw(bmask)
    for b in world.get("buildings", []):
        d.polygon([(x - X0, Y1 - y) for x, y in b["p"]], fill=255)
    for k in world.get("kiosks", []):
        pts = k.get("p") if isinstance(k, dict) else k
        if pts:
            d.polygon([(x - X0, Y1 - y) for x, y in pts], fill=255)
    bmask = ndimage.binary_dilation(np.asarray(bmask) > 0, iterations=3)
    mu = ndimage.uniform_filter(chm, 3)
    rough = np.sqrt(np.maximum(ndimage.uniform_filter(chm * chm, 3) - mu * mu, 0))

    canopy = (ndimage.gaussian_filter(chm, 1.0) > 2.2) & ~bmask & (dtm > 0.2) & (rough > 0.35)
    canopy = ndimage.binary_opening(canopy, iterations=1)
    height = np.where(canopy, ndimage.grey_dilation(chm, size=3), 0)

    # 1 m -> 2 m: keep a cell when most of it is canopy
    h2 = height[: H // STEP * STEP, : W // STEP * STEP].reshape(H // STEP, STEP, W // STEP, STEP)
    c2 = canopy[: H // STEP * STEP, : W // STEP * STEP].reshape(H // STEP, STEP, W // STEP, STEP)
    keep = c2.mean(axis=(1, 3)) >= 0.5
    out = np.where(keep, h2.max(axis=(1, 3)) * 10, 0).clip(0, 250).astype(np.uint8)
    Image.fromarray(out).save(ROOT / "data/canopy.png", optimize=True)
    print(f"canopy: {keep.sum() * STEP * STEP / 1e4:.1f} ha of woods, {out.shape[1]}x{out.shape[0]} px")


if __name__ == "__main__":
    main()
