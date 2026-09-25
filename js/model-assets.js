// Small static-GLB reader for the generated island props and quantized Moth model.
// It bakes prop material colors into vertex colors so coins and shells can be instanced.
import * as THREE from 'three';

const geometries = new Map();

function parseGLB(buffer, type) {
  const view = new DataView(buffer);
  if (view.getUint32(0, true) !== 0x46546c67 || view.getUint32(4, true) !== 2) throw new Error('Invalid GLB');
  let json, bin;
  for (let offset = 12; offset + 8 <= buffer.byteLength;) {
    const length = view.getUint32(offset, true), kind = view.getUint32(offset + 4, true);
    const start = offset + 8;
    if (kind === 0x4e4f534a) json = JSON.parse(new TextDecoder().decode(new Uint8Array(buffer, start, length)));
    if (kind === 0x004e4942) bin = new DataView(buffer, start, length);
    offset = start + length;
  }
  if (!json || !bin) throw new Error('Incomplete GLB');

  const accessor = id => {
    const a = json.accessors[id], b = json.bufferViews[a.bufferView];
    const count = a.type === 'VEC3' ? 3 : 1;
    const bytes = a.componentType === 5126 || a.componentType === 5125 ? 4
      : a.componentType === 5123 ? 2 : 1;
    const stride = b.byteStride || count * bytes;
    const start = (b.byteOffset || 0) + (a.byteOffset || 0);
    const values = new Array(a.count * count);
    for (let i = 0; i < a.count; i++) for (let j = 0; j < count; j++) {
      const at = start + i * stride + j * bytes;
      let value = a.componentType === 5126 ? bin.getFloat32(at, true)
        : a.componentType === 5125 ? bin.getUint32(at, true)
          : a.componentType === 5123 ? bin.getUint16(at, true)
            : a.componentType === 5121 ? bin.getUint8(at) : bin.getInt8(at);
      if (a.normalized) value /= a.componentType === 5123 ? 65535
        : a.componentType === 5121 ? 255 : 127;
      values[i * count + j] = value;
    }
    return values;
  };

  if (type === 'moth') {
    const node = json.nodes.find(n => n.name === 'Moth' && n.mesh != null);
    if (!node) throw new Error('Moth mesh missing from GLB');
    const primitive = json.meshes[node.mesh].primitives[0];
    const geometry = new THREE.BufferGeometry();
    const positions = accessor(primitive.attributes.POSITION);
    for (let i = 0; i < positions.length; i++) positions[i] = positions[i] * node.scale[i % 3] + node.translation[i % 3];
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geometry.setAttribute('normal', new THREE.Float32BufferAttribute(accessor(primitive.attributes.NORMAL), 3));
    geometry.setAttribute('color', new THREE.Float32BufferAttribute(accessor(primitive.attributes.COLOR_0), 3));
    geometry.setIndex(accessor(primitive.indices));
    geometry.computeBoundingBox();
    geometries.set('moth', geometry);
    return;
  }

  for (const group of json.nodes) {
    const found = /^PRP_(conch|coin|mask|crate|chest)$/.exec(group.name || '');
    if (!found) continue;
    const positions = [], normals = [], colors = [];
    for (const childId of group.children || []) {
      const child = json.nodes[childId];
      if (child.mesh == null) continue;
      for (const primitive of json.meshes[child.mesh].primitives) {
        if (primitive.mode !== 4) continue;
        const p = accessor(primitive.attributes.POSITION);
        const n = primitive.attributes.NORMAL == null ? null : accessor(primitive.attributes.NORMAL);
        const indices = accessor(primitive.indices);
        const color = json.materials[primitive.material]?.pbrMetallicRoughness?.baseColorFactor || [1, 1, 1];
        for (const i of indices) {
          positions.push(p[3 * i], p[3 * i + 1], p[3 * i + 2]);
          if (n) normals.push(n[3 * i], n[3 * i + 1], n[3 * i + 2]);
          colors.push(color[0], color[1], color[2]);
        }
      }
    }
    if (!positions.length) continue;
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    if (normals.length === positions.length) geometry.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
    else geometry.computeVertexNormals();
    geometry.computeBoundingBox();
    geometries.set(found[1], geometry);
  }
  if (geometries.size !== 5) throw new Error('Missing island props in GLB');
}

export async function loadIslandModels() {
  try {
    const response = await fetch('assets/island-assets.glb');
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    parseGLB(await response.arrayBuffer(), 'island');
    return true;
  } catch (error) {
    geometries.clear();
    console.warn('Island prop models unavailable; using built-in shapes.', error);
    return false;
  }
}

export async function loadMothModel() {
  try {
    const response = await fetch('assets/moth-lowpoly.glb');
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    parseGLB(await response.arrayBuffer(), 'moth');
    return true;
  } catch (error) {
    console.warn('Moth model unavailable; using built-in shape.', error);
    return false;
  }
}

export function islandGeometry(name, scale = 1, center = false) {
  const base = geometries.get(name);
  if (!base) return null;
  const geometry = base.clone();
  if (Array.isArray(scale)) geometry.scale(...scale);
  else geometry.scale(scale, scale, scale);
  geometry.computeBoundingBox();
  if (center) {
    const box = geometry.boundingBox;
    geometry.translate(-(box.min.x + box.max.x) / 2, -(box.min.y + box.max.y) / 2, -(box.min.z + box.max.z) / 2);
  }
  return geometry;
}
