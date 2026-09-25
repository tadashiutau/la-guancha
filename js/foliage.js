import * as THREE from 'three';
import { P } from './geo.js';

// Leaf clusters share a small number of instanced meshes. Each tree still has its own opacity,
// so a canopy between the camera and player can fade without hiding the whole grove.
export function buildFoliage(scene, trees, palmFrond) {
  const chunks = new Map();
  for (const tree of trees) for (const piece of tree.pieces) {
    const key = `${piece.kind}:${Math.floor(piece.x / 60)},${Math.floor(piece.z / 60)}`;
    if (!chunks.has(key)) chunks.set(key, []);
    chunks.get(key).push({ tree, piece });
  }
  const mat = new THREE.MeshLambertMaterial({ vertexColors: false, side: THREE.DoubleSide,
    transparent: true, depthWrite: false });
  mat.onBeforeCompile = shader => {
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nattribute float instanceOpacity; varying float vFoliageOpacity;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvFoliageOpacity = instanceOpacity;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying float vFoliageOpacity;')
      .replace('#include <map_fragment>', '#include <map_fragment>\ndiffuseColor.a *= vFoliageOpacity;');
  };
  const dummy = new THREE.Object3D();
  const color = new THREE.Color();
  for (const [key, items] of chunks) {
    const source = key.startsWith('broad:') ? P.dodeca() : key.startsWith('palm:') ? palmFrond : P.ico(0);
    const geo = source.clone();
    if (!geo.hasAttribute('normal')) geo.computeVertexNormals();
    const opacity = new THREE.InstancedBufferAttribute(new Float32Array(items.length).fill(1), 1);
    geo.setAttribute('instanceOpacity', opacity);
    const mesh = new THREE.InstancedMesh(geo, mat, items.length);
    mesh.castShadow = true; mesh.receiveShadow = true;
    items.forEach(({ tree, piece }, i) => {
      dummy.position.set(piece.x, piece.y, piece.z);
      dummy.rotation.set(0, piece.yaw, 0);
      dummy.scale.set(piece.sx, piece.sy, piece.sz);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
      mesh.setColorAt(i, color.setHex(piece.color));
      tree.refs.push({ opacity, i });
    });
    mesh.instanceMatrix.needsUpdate = true;
    mesh.instanceColor.needsUpdate = true;
    mesh.computeBoundingSphere();
    scene.add(mesh);
  }

  return (camera, target, dt) => {
    const ax = target.x, ay = target.y + 1.1, az = target.z;
    const vx = camera.position.x - ax, vy = camera.position.y - ay, vz = camera.position.z - az;
    const len2 = vx * vx + vy * vy + vz * vz || 1;
    for (const tree of trees) {
      const wx = tree.x - ax, wy = tree.y - ay, wz = tree.z - az;
      const t = Math.max(0, Math.min(1, (wx * vx + wy * vy + wz * vz) / len2));
      const dx = wx - vx * t, dy = wy - vy * t, dz = wz - vz * t;
      const nearCamera = Math.hypot(tree.x - camera.position.x, tree.z - camera.position.z) < tree.radius * 1.4
        && Math.abs(tree.y - camera.position.y) < tree.radius * 1.6;
      const blocks = nearCamera || dx * dx + dy * dy + dz * dz < tree.radius * tree.radius;
      const wanted = blocks ? 0 : 1;
      const next = tree.opacity + (wanted - tree.opacity) * Math.min(1, dt * (blocks ? 13 : 6));
      if (Math.abs(next - tree.opacity) < 0.002) continue;
      tree.opacity = next;
      for (const { opacity, i } of tree.refs) {
        opacity.array[i] = next;
        opacity.needsUpdate = true;
      }
    }
  };
}
