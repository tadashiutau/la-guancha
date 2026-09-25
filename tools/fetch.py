"""Download raw reference data into data/raw/. Safe to re-run; skips existing files.

Sources (no API keys):
  dem.tif      USGS 3DEP 1 m bare-earth DEM (LiDAR derived)
  bathy.tif    NOAA NCEI CUDEM 1/9" topobathy (2022) - water depths
  naip.tif     NAIP 2022 30 cm orthophoto via Microsoft Planetary Computer
  esri.jpg     Esri World Imagery (reference only)
  pr2017.jpg   PR Gobierno orthophoto 2017 (reference only, great reef detail)
  osm.json     OpenStreetMap via Overpass
  lidar/*.laz  USGS 3DEP point cloud tiles (for trees and roof heights)
"""
import json
import sys

import requests

from common import RAW, bbox_lonlat, X0, X1, Y0, Y1

S = requests.Session()
S.headers["User-Agent"] = "LaGuanchaGame/0.1 (personal project)"
W, SO, E, N = bbox_lonlat()
BB = f"{W},{SO},{E},{N}"
PX = (X1 - X0, Y1 - Y0)  # ~1 m pixels


def get(name, url, **kw):
    p = RAW / name
    if p.exists() and p.stat().st_size > 1000:
        print("skip", name)
        return p
    print("get ", name)
    r = S.get(url, timeout=180, **kw)
    r.raise_for_status()
    p.write_bytes(r.content)
    print("     ", len(r.content) // 1024, "KB")
    return p


def export_image(name, service, px, extra=""):
    url = (f"{service}/exportImage?bbox={BB}&bboxSR=4326&imageSR=4326&size={px[0]},{px[1]}"
           f"&format=tiff&pixelType=F32&interpolation=RSP_BilinearInterpolation&f=image{extra}")
    return get(name, url)


def main():
    RAW.mkdir(parents=True, exist_ok=True)
    (RAW / "lidar").mkdir(exist_ok=True)

    export_image("dem.tif", "https://elevation.nationalmap.gov/arcgis/rest/services/3DEPElevation/ImageServer", PX)
    # Force the CUDEM 1/9" tile so the mosaic doesn't fall back to coarse ETOPO.
    rule = json.dumps({"mosaicMethod": "esriMosaicLockRaster", "where": "Name LIKE 'ncei19_n18x00_w066x75%'"})
    export_image("bathy.tif", "https://gis.ngdc.noaa.gov/arcgis/rest/services/DEM_mosaics/DEM_all/ImageServer",
                 (PX[0] // 3, PX[1] // 3), "&mosaicRule=" + requests.utils.quote(rule))

    img = f"bbox={BB}&bboxSR=4326&size={PX[0] * 2},{PX[1] * 2}&format=jpg&f=image"
    get("esri.jpg", "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/export?" + img)
    get("pr2017.jpg", "https://sige.pr.gov/server/rest/services/foto_pr_2017/MapServer/export?" + img)

    q = f"""[out:json][timeout:60];
    (way({SO},{W},{N},{E}); relation({SO},{W},{N},{E})["type"="multipolygon"];
     node({SO},{W},{N},{E})["name"]; node({SO},{W},{N},{E})["natural"];
     node({SO},{W},{N},{E})["man_made"]; node({SO},{W},{N},{E})["amenity"];
     node({SO},{W},{N},{E})["leisure"]; node({SO},{W},{N},{E})["tourism"];);
    out geom;"""
    p = RAW / "osm.json"
    if not p.exists():
        print("get  osm.json")
        r = S.post("https://overpass-api.de/api/interpreter", data={"data": q}, timeout=120)
        r.raise_for_status()
        p.write_bytes(r.content)

    fetch_naip()
    fetch_lidar()


def fetch_naip():
    p = RAW / "naip.tif"
    if p.exists():
        print("skip naip.tif")
        return
    import rasterio
    from rasterio.warp import transform_bounds
    from rasterio.windows import from_bounds
    items = S.get("https://planetarycomputer.microsoft.com/api/stac/v1/search",
                  params={"collections": "naip", "bbox": BB, "limit": 10}).json()["features"]
    items.sort(key=lambda f: f["properties"]["datetime"], reverse=True)
    newest = items[0]["properties"]["datetime"][:4]
    items = [f for f in items if f["properties"]["datetime"][:4] == newest]
    tok = S.get("https://planetarycomputer.microsoft.com/api/sas/v1/token/naip").json()["token"]
    from rasterio.merge import merge
    srcs = []
    for f in items:
        href = f["assets"]["image"]["href"] + "?" + tok
        print("naip", f["id"])
        srcs.append(rasterio.open(href))
    b = transform_bounds("EPSG:4326", srcs[0].crs, W, SO, E, N)
    arr, tr = merge(srcs, bounds=b, res=0.6, indexes=[1, 2, 3, 4])
    prof = dict(driver="GTiff", height=arr.shape[1], width=arr.shape[2], count=4, dtype=arr.dtype,
                crs=srcs[0].crs, transform=tr, compress="deflate")
    with rasterio.open(p, "w", **prof) as dst:
        dst.write(arr)
    print("     naip", arr.shape)


def fetch_lidar():
    r = S.get("https://tnmaccess.nationalmap.gov/api/v1/products",
              params={"bbox": BB, "datasets": "Lidar Point Cloud (LPC)", "max": 50}).json()
    items = r.get("items", [])
    print("lidar tiles:", len(items))
    for it in items:
        url = it.get("downloadLazURL") or it["downloadURL"]
        name = url.rsplit("/", 1)[-1]
        p = RAW / "lidar" / name
        if p.exists():
            continue
        print("  ", name, it.get("sizeInBytes", 0) // 2**20, "MB")
        with S.get(url, stream=True, timeout=600) as resp:
            resp.raise_for_status()
            with open(p, "wb") as fh:
                for chunk in resp.iter_content(1 << 20):
                    fh.write(chunk)


if __name__ == "__main__":
    sys.exit(main())
