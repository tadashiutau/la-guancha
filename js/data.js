// Loads the preprocessed real-world data (tools/build_world.py) and exposes coordinate helpers.
// Real local frame: meters, +x east, +y north. Game world: X = x*S, Z = -y*S, Y up.
export const S = 0.6; // game units per real meter (the player is ~1.1 units tall)

export const W = (x, y) => [x * S, -y * S];

async function loadImage(url) {
  // onload rather than decode(): decode() can stall while the tab is hidden
  const img = new Image();
  await new Promise((res, rej) => { img.onload = res; img.onerror = () => rej(new Error('No se pudo cargar ' + url)); img.src = url; });
  return img;
}

function pixels(img) {
  const c = document.createElement('canvas');
  c.width = img.width; c.height = img.height;
  const g = c.getContext('2d', { willReadFrequently: true });
  g.drawImage(img, 0, 0);
  return g.getImageData(0, 0, img.width, img.height).data;
}

export async function loadData(onProgress = () => {}) {
  const [world, himg, cimg] = await Promise.all([
    fetch('data/world.json').then(r => r.json()),
    loadImage('data/terrain_h.png'),
    loadImage('data/terrain_c.jpg'),
  ]);
  onProgress(0.3);
  const f = world.frame;
  const hp = pixels(himg);
  const gw = himg.width, gh = himg.height;
  const heights = new Float32Array(gw * gh);
  for (let i = 0; i < gw * gh; i++) heights[i] = ((hp[i * 4] << 8 | hp[i * 4 + 1]) / 1000 - 20) * S;

  const step = f.hstep * S;
  const X0 = f.x0 * S, Z0 = -f.y1 * S; // top-left corner in world space
  const deep = -9 * S;

  // bilinear height at world (X, Z); open sea outside the grid
  function terrainH(X, Z) {
    const gx = (X - X0) / step, gz = (Z - Z0) / step;
    if (gx < 0 || gz < 0 || gx >= gw - 1 || gz >= gh - 1) return deep;
    const i = gx | 0, j = gz | 0, fx = gx - i, fz = gz - j;
    const k = j * gw + i;
    const a = heights[k], b = heights[k + 1], c = heights[k + gw], d = heights[k + gw + 1];
    return (a * (1 - fx) + b * fx) * (1 - fz) + (c * (1 - fx) + d * fx) * fz;
  }

  return {
    world, heights, gw, gh, step, X0, Z0, terrainH, colorImg: cimg,
    bounds: { x0: f.x0 * S, x1: f.x1 * S, z0: -f.y1 * S, z1: -f.y0 * S },
  };
}
