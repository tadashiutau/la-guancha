"""Make the low-poly, flat-shaded Moth used in game from the dense Meshy scan.

Reads assets/moth-optimized.glb (quantized, vertex colored), decimates it and writes
assets/moth-lowpoly.glb: one non-indexed-style mesh (every face has its own three
vertices) with a face normal and one averaged fur color per face, so it reads as
faceted low-poly art. Node name, scale and translation match what js/model-assets.js expects.

    .venv/bin/python tools/lowpoly_moth.py [target_triangles]
"""
import json
import struct
import sys
from pathlib import Path

import fast_simplification
import numpy as np
from scipy import ndimage
from scipy.spatial import cKDTree
from skimage.measure import marching_cubes

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / 'assets/moth-optimized.glb'
DST = ROOT / 'assets/moth-lowpoly.glb'
TARGET = int(sys.argv[1]) if len(sys.argv) > 1 else 3000

COMP = {5120: (np.int8, 127), 5121: (np.uint8, 255), 5122: (np.int16, 32767),
        5123: (np.uint16, 65535), 5125: (np.uint32, 1), 5126: (np.float32, 1)}


def read_glb(path):
    b = path.read_bytes()
    jl = struct.unpack('<I', b[12:16])[0]
    j = json.loads(b[20:20 + jl])
    bin_start = 20 + jl + 8
    return j, b[bin_start:]


def accessor(j, bin_, i):
    a = j['accessors'][i]
    bv = j['bufferViews'][a['bufferView']]
    dt, norm = COMP[a['componentType']]
    n = {'SCALAR': 1, 'VEC2': 2, 'VEC3': 3, 'VEC4': 4}[a['type']]
    item = np.dtype(dt).itemsize
    stride = bv.get('byteStride', n * item)
    start = bv.get('byteOffset', 0) + a.get('byteOffset', 0)
    raw = np.frombuffer(bin_, dtype=np.uint8, count=stride * (a['count'] - 1) + n * item, offset=start)
    rows = np.lib.stride_tricks.as_strided(raw, shape=(a['count'], n * item), strides=(stride, 1))
    out = np.ascontiguousarray(rows).view(dt).reshape(a['count'], n).astype(np.float64)
    if a.get('normalized'):
        out = np.maximum(out / norm, -1)
    return out


def main():
    j, bin_ = read_glb(SRC)
    node = next(n for n in j['nodes'] if n.get('name') == 'Moth')
    prim = j['meshes'][node['mesh']]['primitives'][0]
    pos = accessor(j, bin_, prim['attributes']['POSITION']) * node['scale'] + node['translation']
    col = accessor(j, bin_, prim['attributes']['COLOR_0'])
    idx = accessor(j, bin_, prim['indices']).astype(np.int64).reshape(-1, 3)
    print(f'source: {len(pos)} verts, {len(idx)} tris')

    # The scan's fur is thousands of loose strands that won't decimate, so rebuild one clean
    # closed surface from a voxel fill first, then simplify that.
    vox = 0.015
    lo = pos.min(axis=0) - 4 * vox
    pts = np.concatenate([pos, pos[idx].mean(axis=1)])
    ijk = np.floor((pts - lo) / vox).astype(int)
    shell = np.zeros(ijk.max(axis=0) + 5, bool)
    shell[tuple(ijk.T)] = True
    shell = ndimage.binary_closing(shell, iterations=1)
    # The scan is an open shell, so fill it solid: a voxel is inside when every axis-aligned
    # line through it hits the surface on both sides (intersection of three scanline fills).
    solid = np.ones_like(shell)
    for ax in range(3):
        c = np.cumsum(shell, axis=ax)
        solid &= (c > 0) & (np.flip(np.cumsum(np.flip(shell, ax), axis=ax), ax) > 0)
    grid = solid | shell
    lab, n = ndimage.label(grid)
    if n > 1:
        grid = lab == np.argmax(np.bincount(lab.ravel())[1:]) + 1
    field = ndimage.gaussian_filter(grid.astype(np.float32), 0.8)
    mv, mf, _, _ = marching_cubes(field, 0.5)
    mv = mv * vox + lo
    print(f'remeshed: {len(mv)} verts, {len(mf)} tris')
    reduction = 1 - TARGET / len(mf)
    v, f = fast_simplification.simplify(mv.astype(np.float32), mf.astype(np.int32), reduction)
    print(f'low poly: {len(v)} verts, {len(f)} tris')

    # each face takes the average fur color of the dense scan around its centroid
    tree = cKDTree(pos)
    tri = v[f]
    cent = tri.mean(axis=1)
    _, near = tree.query(cent, k=48)
    fc = col[near].mean(axis=1)

    nrm = np.cross(tri[:, 1] - tri[:, 0], tri[:, 2] - tri[:, 0])
    nrm /= np.linalg.norm(nrm, axis=1, keepdims=True) + 1e-12

    P = tri.reshape(-1, 3).astype(np.float32)
    N = np.repeat(nrm, 3, axis=0).astype(np.float32)
    C = np.repeat(fc, 3, axis=0).astype(np.float32)
    I = np.arange(len(P), dtype=np.uint16 if len(P) < 65536 else np.uint32)

    chunks, views, accs = [], [], []
    off = 0
    for arr, kind in ((P, 'VEC3'), (N, 'VEC3'), (C, 'VEC3'), (I, 'SCALAR')):
        data = arr.tobytes()
        pad = (-len(data)) % 4
        views.append({'buffer': 0, 'byteOffset': off, 'byteLength': len(data)})
        acc = {'bufferView': len(views) - 1, 'count': len(arr), 'type': kind,
               'componentType': 5126 if arr.dtype == np.float32 else 5123 if arr.dtype == np.uint16 else 5125}
        if kind == 'VEC3' and not accs:
            acc['min'] = P.min(axis=0).tolist(); acc['max'] = P.max(axis=0).tolist()
        accs.append(acc)
        chunks.append(data + b'\0' * pad)
        off += len(data) + pad
    binary = b''.join(chunks)
    gltf = {
        'asset': {'version': '2.0', 'generator': 'tools/lowpoly_moth.py'},
        'scene': 0, 'scenes': [{'nodes': [0]}],
        'nodes': [{'name': 'Moth', 'mesh': 0, 'scale': [1, 1, 1], 'translation': [0, 0, 0]}],
        'meshes': [{'primitives': [{'attributes': {'POSITION': 0, 'NORMAL': 1, 'COLOR_0': 2}, 'indices': 3, 'mode': 4}]}],
        'buffers': [{'byteLength': len(binary)}], 'bufferViews': views, 'accessors': accs,
    }
    js = json.dumps(gltf, separators=(',', ':')).encode()
    js += b' ' * ((-len(js)) % 4)
    out = struct.pack('<III', 0x46546C67, 2, 12 + 8 + len(js) + 8 + len(binary))
    out += struct.pack('<II', len(js), 0x4E4F534A) + js + struct.pack('<II', len(binary), 0x004E4942) + binary
    DST.write_bytes(out)
    print(f'wrote {DST.relative_to(ROOT)} ({len(out) / 1024:.0f} KB)')


if __name__ == '__main__':
    main()
