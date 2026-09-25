"""Shared constants for the La Guancha data pipeline.

Local frame: meters, origin at LAT0/LON0, +x east, +y north (same as the handoff).
"""
import math
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
RAW = ROOT / "data" / "raw"
OUT = ROOT / "data"

LAT0, LON0 = 17.9655, -66.6135
KX = 111320 * math.cos(math.radians(LAT0))  # meters per degree lon
KY = 110600                                  # meters per degree lat

# Area of interest in local meters (basin, piers, beach, reef, park, south port edge)
X0, X1 = -680, 520
Y0, Y1 = -400, 440


def to_local(lon, lat):
    return (lon - LON0) * KX, (lat - LAT0) * KY


def to_lonlat(x, y):
    return LON0 + x / KX, LAT0 + y / KY


def bbox_lonlat(pad=0):
    w, s = to_lonlat(X0 - pad, Y0 - pad)
    e, n = to_lonlat(X1 + pad, Y1 + pad)
    return w, s, e, n
