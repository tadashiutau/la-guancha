"""Turn data/raw/* into compact game data.

Outputs (all in the local meter frame from common.py):
  data/terrain_h.png   16-bit heights on a 3 m vertex grid, packed into R (high) and G (low)
  data/terrain_c.png   1 m stylized ground colors (also used as the mini-map)
  data/world.json      buildings, piers, boardwalk, trees, boats, points of interest
"""
import json
import math
from pathlib import Path

import numpy as np
import rasterio
from affine import Affine
from PIL import Image
from rasterio.features import rasterize
from rasterio.warp import Resampling, reproject
from scipy import ndimage
from shapely.geometry import LineString, Polygon, mapping
from shapely.ops import unary_union

from common import KX, KY, OUT, RAW, X0, X1, Y0, Y1, to_local, to_lonlat

W, H = X1 - X0, Y1 - Y0            # 1 m grid size
HSTEP = 3                          # terrain vertex spacing (m)
LOCAL = Affine(1, 0, X0, 0, -1, Y1)  # local meters -> 1 m pixel
lon_w, lat_n = to_lonlat(X0, Y1)
GEO = Affine(1 / KX, 0, lon_w, 0, -1 / KY, lat_n)  # the same grid in EPSG:4326


def warp(path, band=1, resampling=Resampling.bilinear, dtype="float32"):
    dst = np.zeros((H, W), dtype)
    with rasterio.open(path) as s:
        reproject(rasterio.band(s, band), dst, dst_transform=GEO, dst_crs="EPSG:4326", resampling=resampling)
    return dst


# ---------------------------------------------------------------- OSM
def load_osm():
    o = json.load(open(RAW / "osm.json"))
    ways, nodes = [], []
    for e in o["elements"]:
        t = e.get("tags", {})
        if e["type"] == "way" and "geometry" in e:
            pts = [to_local(p["lon"], p["lat"]) for p in e["geometry"]]
            ways.append((t, pts))
        elif e["type"] == "node":
            nodes.append((t, to_local(e["lon"], e["lat"])))
    return ways, nodes


def poly(pts):
    p = Polygon(pts)
    return p if p.is_valid else p.buffer(0)


def rnd(pts, d=1):
    return [[round(x, d), round(y, d)] for x, y in pts]


# ---------------------------------------------------------------- LiDAR
def lidar_grids():
    """Return (dsm_veg, dsm_bld, dtm) 1 m grids from LAZ tiles, NaN where empty."""
    import laspy
    from pyproj import Transformer
    tiles = sorted((RAW / "lidar").glob("*.laz"))
    tiles = [t for t in tiles if t.stat().st_size > 1_000_000]
    if not tiles:
        return None
    tr = Transformer.from_crs("EPSG:6566", "EPSG:4326", always_xy=True)
    veg = np.full((H, W), -np.inf, "f4")
    bld = np.full((H, W), -np.inf, "f4")
    gsum = np.zeros((H, W), "f8")
    gcnt = np.zeros((H, W), "i4")
    for t in tiles:
        print("lidar", t.name)
        with laspy.open(t) as f:
            for pts in f.chunk_iterator(4_000_000):
                cls = np.asarray(pts.classification)
                keep = np.isin(cls, [1, 2, 3, 4, 5, 6])
                if not keep.any():
                    continue
                lon, lat = tr.transform(np.asarray(pts.x)[keep], np.asarray(pts.y)[keep])
                x, y = to_local(lon, lat)
                c = (np.floor(x - X0)).astype(int)
                r = (np.floor(Y1 - y)).astype(int)
                ok = (c >= 0) & (c < W) & (r >= 0) & (r < H)
                z = np.asarray(pts.z)[keep][ok].astype("f4")
                c, r, k = c[ok], r[ok], cls[keep][ok]
                g = k == 2
                np.add.at(gsum, (r[g], c[g]), z[g])
                np.add.at(gcnt, (r[g], c[g]), 1)
                # this survey leaves vegetation AND buildings as class 1 (unclassified)
                v = (k == 1) | (k == 4) | (k == 5)
                np.maximum.at(veg, (r[v], c[v]), z[v])
                b = (k == 6) | (k == 1)
                np.maximum.at(bld, (r[b], c[b]), z[b])
    dtm = np.where(gcnt > 0, gsum / np.maximum(gcnt, 1), np.nan).astype("f4")
    # fill DTM holes (under buildings/trees) with nearest ground
    idx = ndimage.distance_transform_edt(np.isnan(dtm), return_distances=False, return_indices=True)
    dtm = dtm[tuple(idx)]
    veg[np.isinf(veg)] = np.nan
    bld[np.isinf(bld)] = np.nan
    return veg, bld, dtm


def find_trees(veg, dtm, wetland_mask, bld_mask, land):
    chm = np.nan_to_num(veg - dtm, nan=0)
    chm[bld_mask | ~land] = 0
    chm = np.clip(chm, 0, 30)
    sm = ndimage.gaussian_filter(chm, 1.2)
    peaks = (sm == ndimage.maximum_filter(sm, size=7)) & (sm > 2.5)
    rr, cc = np.nonzero(peaks)
    trees = []
    for r, c in zip(rr, cc):
        h = float(chm[max(r - 1, 0):r + 2, max(c - 1, 0):c + 2].max())
        win = sm[max(r - 6, 0):r + 7, max(c - 6, 0):c + 7]
        area = float((win > 0.55 * sm[r, c]).sum())
        rad = max(1.2, min(7.0, math.sqrt(area / math.pi)))
        x, y = X0 + c + 0.5, Y1 - r - 0.5
        kind = "mangrove" if wetland_mask[r, c] else ("palm" if rad < 3.2 and h > 5 else "tree")
        trees.append([round(x, 1), round(y, 1), round(h, 1), round(rad, 1), kind])
    return trees


def lidar_buildings(bldz, dtm, land, osm_mask, esri):
    from rasterio.features import shapes
    nd = np.nan_to_num(bldz - dtm, nan=0)
    nd[~land] = 0
    mu = ndimage.uniform_filter(nd, 3)
    rough = np.sqrt(np.maximum(ndimage.uniform_filter(nd * nd, 3) - mu * mu, 0))
    exg = 2 * esri[..., 1] - esri[..., 0] - esri[..., 2]
    m = (nd > 2.6) & (nd < 25) & (rough < 0.5) & (exg < 14) & ~ndimage.binary_dilation(osm_mask, iterations=3)
    m = ndimage.binary_opening(m, iterations=1)
    m = ndimage.binary_fill_holes(ndimage.binary_closing(m, iterations=2))
    lab, n = ndimage.label(m)
    out = []
    for geom, val in shapes(lab.astype("int32"), mask=lab > 0, transform=LOCAL):
        p = Polygon(geom["coordinates"][0]).simplify(1.0)
        if not p.is_valid or p.area < 30 or p.area > 5000:
            continue
        rr = p.minimum_rotated_rectangle
        if p.area / max(rr.area, 1) < 0.6:
            continue
        # footprints come out ragged; square them up to their oriented rectangle when they nearly fill it
        if p.area / rr.area > 0.8:
            p = rr
        sel = lab == int(val)
        ht = float(np.median(nd[sel]))
        if np.std(nd[sel]) > 2.5:
            continue  # tree clumps are bumpy
        out.append((p, ht))
    return out


# ---------------------------------------------------------------- boats from NAIP
def find_boats(rgb, water):
    bright = rgb.mean(0)
    sat = rgb.max(0) - rgb.min(0)
    m = (bright > 175) & (sat < 60) & ndimage.binary_erosion(water, iterations=2)
    m = ndimage.binary_opening(m, iterations=1)
    lab, n = ndimage.label(m)
    boats = []
    for i, sl in enumerate(ndimage.find_objects(lab), 1):
        rr, cc = np.nonzero(lab[sl] == i)
        if not (8 <= len(rr) <= 500):
            continue
        xs = X0 + cc + sl[1].start + 0.5
        ys = Y1 - (rr + sl[0].start) - 0.5
        cx, cy = xs.mean(), ys.mean()
        cov = np.cov(np.vstack([xs - cx, ys - cy]))
        ev, evec = np.linalg.eigh(cov)
        length = 4 * math.sqrt(max(ev[1], 0.1))
        width = 4 * math.sqrt(max(ev[0], 0.05))
        if length < 4 or length > 30 or width > 9 or length / width < 1.6:
            continue
        yaw = math.atan2(evec[1, 1], evec[0, 1])
        boats.append([round(cx, 1), round(cy, 1), round(length, 1), round(width, 1), round(yaw, 3)])
    return boats


# ---------------------------------------------------------------- stylized ground (0.5 m)
PPM = 2  # texture pixels per meter


def stylized_ground(ways_where, poly, land, beach, sea):
    """Satellite photo cleaned up and stylized, with crisp roads and walkways drawn on top."""
    from PIL import ImageDraw, ImageFilter
    Wp, Hp = W * PPM, H * PPM
    e = Image.open(RAW / "esri.jpg").convert("RGB")
    if e.size != (Wp, Hp):
        e = e.resize((Wp, Hp), Image.LANCZOS)
    e = np.asarray(e).astype("f4")
    # remove cars and speckle, keep edges
    med = np.stack([ndimage.median_filter(e[..., i], 5) for i in range(3)], -1)
    base = 0.75 * med + 0.25 * ndimage.gaussian_filter(e, (1, 1, 0))
    # lift tree/building shadows toward the local brightness
    L = base.mean(-1)
    lm = ndimage.gaussian_filter(L, 12)
    dark = np.clip((lm - L - 8) / 40, 0, 1)[..., None]
    base = base + (lm - L)[..., None] * dark * 0.75
    # stylize: richer color, a touch brighter
    m = base.mean(-1, keepdims=True)
    base = m + (base - m) * 1.7
    base = (base - 128) * 1.1 + 130
    exg = 2 * base[..., 1] - base[..., 0] - base[..., 2]
    g = np.clip((exg - 8) / 35, 0, 1)[..., None]
    lush = np.array([98, 170, 72], "f4") * (0.8 + 0.4 * (base.mean(-1, keepdims=True) / 255))
    base = base * (1 - g * 0.55) + lush * g * 0.55

    up = lambda a: np.repeat(np.repeat(a, PPM, 0), PPM, 1)
    land2 = ndimage.gaussian_filter(up(land).astype("f4"), 1.2)[..., None]
    sea2 = np.asarray(Image.fromarray(np.clip(sea, 0, 255).astype(np.uint8)).resize((Wp, Hp), Image.BILINEAR)).astype("f4")
    sand = np.array([238, 220, 168], "f4")
    bm = ndimage.gaussian_filter(up(beach & land).astype("f4"), 2)[..., None]
    base = base * (1 - bm * 0.5) + sand * bm * 0.5
    col = base * land2 + sea2 * (1 - land2)

    # vector overlay drawn at 2x and downsampled for smooth, sharp edges
    SS = 2
    over = Image.new("RGBA", (Wp * SS, Hp * SS), (0, 0, 0, 0))
    d = ImageDraw.Draw(over)
    k = PPM * SS
    P = lambda pts: [((x - X0) * k, (Y1 - y) * k) for x, y in pts]
    lots = [poly(p) for t, p in ways_where(lambda t: t.get("amenity") == "parking") if len(p) > 3]
    from shapely.geometry import LineString as LS
    from shapely.ops import unary_union as UU
    lot_u = UU(lots) if lots else None

    def line(pts, width_m, fill):
        d.line(P(pts), fill=fill, width=max(1, int(width_m * k)), joint="curve")
        r = width_m * k / 2
        for x, y in P(pts):
            d.ellipse([x - r, y - r, x + r, y + r], fill=fill)

    roads = []
    for t, p in ways_where(lambda t: t.get("highway") in ("primary", "residential", "tertiary", "unclassified", "service")):
        if len(p) < 2:
            continue
        hw = t["highway"]
        if hw == "service" and lot_u is not None and LS(p).within(lot_u.buffer(2)):
            continue  # parking-lot aisles already show in the photo
        w = {"primary": 10.5, "service": 5.5}.get(hw, 7.5)
        roads.append((hw, p, w))
    for hw, p, w in roads:                       # curbs / sidewalks
        line(p, w + 2.2, (214, 208, 196, 255))
    for hw, p, w in roads:                       # asphalt
        line(p, w, (96, 100, 108, 255))
    for hw, p, w in roads:                       # lane markings
        if hw == "service":
            continue
        ls = LS(p)
        if hw == "primary":
            for off in (-0.18, 0.18):
                o = ls.parallel_offset(off, "left") if off > 0 else ls.parallel_offset(-off, "right")
                if not o.is_empty and o.geom_type == "LineString":
                    d.line(P(o.coords), fill=(247, 201, 72, 255), width=max(1, int(0.18 * k)))
        else:
            n = int(ls.length // 6)
            for i in range(n):
                a, b = ls.interpolate(i * 6), ls.interpolate(i * 6 + 3)
                d.line(P([(a.x, a.y), (b.x, b.y)]), fill=(245, 245, 240, 255), width=max(1, int(0.18 * k)))
    for t, p in ways_where(lambda t: t.get("highway") in ("footway", "path", "pedestrian") and t.get("bridge") is None):
        if len(p) > 1:
            line(p, 2.4, (214, 176, 146, 150))
    over = over.resize((Wp, Hp), Image.LANCZOS)
    o = np.asarray(over).astype("f4")
    a = (o[..., 3:] / 255) * land2
    col = col * (1 - a) + o[..., :3] * a
    # a little film grain so large flat areas don't look plastic
    grain = ndimage.gaussian_filter(np.random.default_rng(3).standard_normal((Hp, Wp)), 0.7)[..., None]
    col = col + grain * 5 * land2
    return np.clip(col, 0, 255).astype(np.uint8)


# ---------------------------------------------------------------- main
PAL = {
    "grass": (92, 170, 70), "grass2": (150, 184, 86), "dirt": (206, 188, 140),
    "asphalt": (92, 96, 104), "lot": (150, 150, 150), "paver": (196, 150, 120),
    "sand": (240, 222, 170), "rock": (140, 132, 120), "mud": (98, 110, 70),
    "court": (70, 130, 160), "pool": (80, 190, 230), "concrete": (200, 196, 186),
    "sea_sand": (220, 210, 160), "sea_reef": (120, 110, 80), "sea_grass": (70, 110, 70),
}


def main():
    print("warping rasters")
    dem = warp(RAW / "dem.tif")
    bathy = warp(RAW / "bathy.tif")
    with rasterio.open(RAW / "naip.tif") as s:
        naip = np.zeros((4, H, W), "f4")
        for b in range(4):
            reproject(rasterio.band(s, b + 1), naip[b], dst_transform=GEO, dst_crs="EPSG:4326",
                      resampling=Resampling.average)
    rgb, nir = naip[:3], naip[3]

    ways, nodes = load_osm()

    def mask(geoms, all_touched=False):
        geoms = [g for g in geoms if g is not None and not g.is_empty]
        if not geoms:
            return np.zeros((H, W), bool)
        return rasterize(geoms, (H, W), transform=LOCAL, all_touched=all_touched).astype(bool)

    def ways_where(f):
        return [(t, p) for t, p in ways if f(t)]

    # ---- land / water
    land = dem > 0.3
    land = ndimage.binary_closing(ndimage.binary_opening(land, iterations=1), iterations=2)
    lab, n = ndimage.label(~land)
    # tiny enclosed "water" holes on land are DEM noise
    sizes = ndimage.sum(np.ones_like(lab), lab, range(n + 1))
    land |= (sizes[lab] < 400) & ~land & (lab > 0)
    water = ~land

    wet_polys = [poly(p) for t, p in ways_where(lambda t: t.get("natural") == "wetland") if len(p) > 3]
    wetland = mask(wet_polys)
    bld_polys = [(t, poly(p)) for t, p in ways_where(lambda t: "building" in t) if len(p) > 3]
    bldm = mask([p for _, p in bld_polys])

    # ---- heights
    h = np.where(land, np.maximum(dem, 0.4), np.minimum(bathy, -0.6))
    # seabed smoothing, keep seawalls crisp
    hs = ndimage.gaussian_filter(np.where(water, h, -0.6), 2)
    h = np.where(water, np.minimum(hs, -0.6), h)
    # beaches slope smoothly into the sea
    beach_polys = [poly(p) for t, p in ways_where(lambda t: t.get("natural") == "beach") if len(p) > 3]
    beach = mask(beach_polys)
    near_beach = ndimage.binary_dilation(beach, iterations=10)
    dist_w = ndimage.distance_transform_edt(land)
    dist_l = ndimage.distance_transform_edt(water)
    slope_land = np.minimum(h, 0.15 + dist_w * 0.08)
    slope_sea = np.maximum(h, -0.2 - dist_l * 0.06)
    h = np.where(near_beach & land, slope_land, h)
    h = np.where(near_beach & water, slope_sea, h)
    hv = h[::HSTEP, ::HSTEP]
    enc = np.clip(np.round((hv + 20) * 1000), 0, 65535).astype(np.uint16)
    img = np.zeros(enc.shape + (3,), np.uint8)
    img[..., 0] = enc >> 8
    img[..., 1] = enc & 255
    Image.fromarray(img).save(OUT / "terrain_h.png")
    print("terrain_h", enc.shape, "range", hv.min().round(2), hv.max().round(2))

    # ---- colors
    # NAIP's 4th band is unusable here, so greenness comes from Esri imagery (excess-green index).
    # South Ponce is dry; open land is stylized as grass, shaded dry -> lush by real greenness.
    esri = np.asarray(Image.open(RAW / "esri.jpg").convert("RGB").resize((W, H), Image.BILINEAR)).astype("f4")
    esri = ndimage.gaussian_filter(esri, (2, 2, 0))
    exg = 2 * esri[..., 1] - esri[..., 0] - esri[..., 2]
    lum = esri.mean(-1)
    g = np.clip((exg - 5) / 35, 0, 1)[..., None]
    col = np.array(PAL["grass2"], "f4") * (1 - g) + np.array(PAL["grass"], "f4") * g
    bare = ndimage.gaussian_filter(((lum > 195) & (exg < 8)).astype("f4"), 2)[..., None]
    col = col * (1 - bare) + np.array(PAL["dirt"], "f4") * bare
    patch = ndimage.gaussian_filter(np.random.default_rng(1).random((H, W)), 6)
    col = col + (patch[..., None] - 0.5) * 50

    # seabed tones from imagery brightness (1 m), used under water in the stylized ground
    lum = ndimage.median_filter(rgb.mean(0), 7)
    # boats and surf are small bright blobs: a grey opening removes them from the seabed
    lum = np.where(water, ndimage.grey_opening(lum, size=(21, 21)), lum)
    lum = ndimage.gaussian_filter(lum, 2)
    lo, hi = np.percentile(lum[water], [5, 95])
    t = np.clip((lum - lo) / max(hi - lo, 1), 0, 1)[..., None]
    sea = np.array(PAL["sea_reef"]) * (1 - t) + np.array(PAL["sea_sand"]) * t
    sea = sea * (1 - 0.3 * np.clip(-h / 10, 0, 1))[..., None]
    ground = stylized_ground(ways_where, poly, land, beach, sea)
    Image.fromarray(ground).save(OUT / "terrain_c.jpg", quality=86, optimize=True)
    print("terrain_c", ground.shape, (OUT / "terrain_c.jpg").stat().st_size // 1024, "KB")

    # ---- vectors
    world = {"frame": {"lat0": 37, "x0": X0, "x1": X1, "y0": Y0, "y1": Y1, "hstep": HSTEP}}
    world["frame"]["lat0"] = 17.9655
    world["frame"]["lon0"] = -66.6135

    tab = [p for t, p in ways if t.get("name") == "Paseo Tablado La Guancha" and t.get("bridge") == "boardwalk"]
    world["tablado"] = [rnd(LineString(p).simplify(1.0).coords) for p in tab]
    tb = [p for t, p in ways if t.get("bridge") == "yes" and t.get("highway") == "footway"]
    world["bridges"] = [rnd(p) for p in tb]

    lid = lidar_grids()
    world["trees"] = []
    if lid:
        veg, bldz, dtm = lid
        world["trees"] = find_trees(veg, dtm, wetland, ndimage.binary_dilation(bldm, iterations=2), ndimage.binary_erosion(land, iterations=2) | wetland)
        print("trees", len(world["trees"]))
    else:
        print("WARNING: no LiDAR tiles - trees skipped, buildings use default heights")

    def building(p, kind, ht, src):
        m = mask([p.buffer(-1.0) if p.buffer(-1.0).area > 2 else p])
        base = float(np.median(h[m])) if m.any() else 1.0
        rc = np.median(esri[m], 0) if m.any() else np.array([180, 180, 180])
        # boost saturation a bit for the stylized look
        rc = np.clip(rc.mean() + (rc - rc.mean()) * 1.6, 0, 255)
        # oriented bounding rectangle: center, half sizes, angle of the first axis; rectness = fill ratio
        mrr = list(p.minimum_rotated_rectangle.exterior.coords)
        (ax, ay), (bx, by), (cx2, cy2) = mrr[0], mrr[1], mrr[2]
        a1, a2 = math.hypot(bx - ax, by - ay), math.hypot(cx2 - bx, cy2 - by)
        ang = math.atan2(by - ay, bx - ax)
        ctr = p.minimum_rotated_rectangle.centroid
        rect = [round(ctr.x, 1), round(ctr.y, 1), round(a1 / 2, 2), round(a2 / 2, 2), round(ang, 3),
                round(p.area / max(a1 * a2, 1e-6), 2)]
        return {"k": kind, "p": rnd(list(p.exterior.coords)[:-1]), "h": round(ht, 1), "b": round(base, 2),
                "rc": [int(v) for v in rc], "r": rect, "src": src}

    blds = []
    for t, p in bld_polys:
        p = p.simplify(0.6)
        if p.geom_type != "Polygon" or p.area < 4:
            continue
        ht = None
        if lid:
            m = mask([p])
            zs = bldz[m]
            zs = zs[~np.isnan(zs)]
            if len(zs) > 5:
                ht = float(np.percentile(zs, 90) - np.median(dtm[m]))
        kind = "tank" if t.get("man_made") == "storage_tank" else (
            "tower" if t.get("man_made") == "tower" else ("roof" if t.get("building") == "roof" else "bld"))
        if ht is None or not (2 < ht < 40):
            ht = {"tank": 12, "tower": 12, "roof": 5}.get(kind, 4.5 if p.area < 200 else 7)
        blds.append(building(p, kind, ht, "osm"))
    # buildings OpenStreetMap is missing, found in the LiDAR: tall, flat, not green, not already mapped
    if lid:
        for p, ht in lidar_buildings(bldz, dtm, land, bldm, esri):
            blds.append(building(p, "bld", ht, "lidar"))
        print("lidar buildings", sum(1 for b in blds if b["src"] == "lidar"))
    world["buildings"] = blds

    piers = []
    for t, p in ways_where(lambda t: t.get("man_made") == "pier"):
        closed = len(p) > 3 and p[0] == p[-1]
        piers.append({"p": rnd(p), "area": closed, "float": t.get("floating") == "yes",
                      "ruin": "ruined" in t or "abandoned" in t})
    world["piers"] = piers
    world["breakwaters"] = [rnd(poly(p).simplify(1).exterior.coords) for t, p in
                            ways_where(lambda t: t.get("man_made") == "breakwater") if len(p) > 3]
    world["parking"] = [rnd(poly(p).simplify(1).exterior.coords) for t, p in
                        ways_where(lambda t: t.get("amenity") == "parking") if len(p) > 3]
    world["wetland"] = [rnd(p.simplify(1).exterior.coords) for p in wet_polys if p.geom_type == "Polygon"]
    world["beach"] = [rnd(p.simplify(1).exterior.coords) for p in beach_polys if p.geom_type == "Polygon"]
    parks = [poly(p) for t, p in ways_where(lambda t: t.get("leisure") == "park") if len(p) > 3]
    world["park"] = [rnd(p.exterior.coords) for p in parks]
    world["footways"] = [rnd(LineString(p).simplify(1).coords) for t, p in
                         ways_where(lambda t: t.get("highway") in ("footway", "path")) if len(p) > 1]
    world["roads"] = [{"w": {"primary": 11, "service": 6}.get(t["highway"], 8),
                       "p": rnd(LineString(p).simplify(1).coords)} for t, p in
                      ways_where(lambda t: t.get("highway") in ("primary", "service", "residential", "tertiary"))
                      if len(p) > 1]
    world["poi"] = [{"t": {k: v for k, v in t.items() if k in ("name", "amenity", "tourism", "natural")},
                     "p": [round(x, 1), round(y, 1)]} for t, (x, y) in nodes
                    if X0 <= x <= X1 and Y0 <= y <= Y1]

    rgbw = np.stack([ndimage.median_filter(rgb[i], 3) for i in range(3)])
    # only moored boats in the sheltered basin (surf on the reef also reads as "white blobs")
    deep = water & (h < -1.8)
    yy = Y1 - np.arange(H)[:, None]
    basin = deep & (yy > -235)
    world["boats"] = find_boats(rgbw, basin)
    print("boats", len(world["boats"]))

    far = {"cardona": (-66.63509, 17.95680), "caja": (-66.52117, 17.89319), "jueyes": (-66.58967, 17.95937)}
    world["far"] = {k: [round(v, 0) for v in to_local(*ll)] for k, ll in far.items()}

    (OUT / "world.json").write_text(json.dumps(world, separators=(",", ":")))
    print("world.json", (OUT / "world.json").stat().st_size // 1024, "KB")


if __name__ == "__main__":
    main()
