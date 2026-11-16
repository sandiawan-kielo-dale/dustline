// Meridian Depot — DUSTLINE's own map. Two bomb sites (A: warehouse north-west,
// B: yard south-east), a mid building with a raised platform, and long corridors
// on both flanks. Nothing here copies a commercial map: the layout, names and art
// are original. Boxes are {x, z, w, d, h, y?, mat}.
import * as THREE from 'three';
import { PALETTE } from './palette.js';

const WALL = 4.5;

const BOXES = [
  // Perimeter
  { x: 0, z: -18.5, w: 46, d: 1, h: WALL, mat: 'concrete' },
  { x: 0, z: 18.5, w: 46, d: 1, h: WALL, mat: 'concrete' },
  { x: -22.5, z: 0, w: 1, d: 38, h: WALL, mat: 'concrete' },
  { x: 22.5, z: 0, w: 1, d: 38, h: WALL, mat: 'concrete' },
  // Site A warehouse (NW): east wall with a door, south wall with a door
  { x: -11, z: -15, w: 1, d: 4, h: WALL, mat: 'metal' },
  { x: -11, z: -9, w: 1, d: 4, h: WALL, mat: 'metal' },
  { x: -19, z: -7, w: 4, d: 1, h: WALL, mat: 'metal' },
  { x: -13, z: -7, w: 4, d: 1, h: WALL, mat: 'metal' },
  // A interior crates
  { x: -18, z: -14, w: 2, d: 2, h: 1.2, mat: 'crateWood' },
  { x: -18, z: -14, w: 1.2, d: 1.2, h: 1.2, y: 1.2, mat: 'crateTeal' },
  { x: -13.5, z: -9.5, w: 1.6, d: 1.6, h: 1.1, mat: 'crateTeal' },
  // Mid building: four walls, each with a door gap
  { x: -4, z: -3.5, w: 1, d: 5, h: 3.6, mat: 'concrete' },
  { x: -4, z: 3.5, w: 1, d: 5, h: 3.6, mat: 'concrete' },
  { x: 4, z: -3.5, w: 1, d: 5, h: 3.6, mat: 'concrete' },
  { x: 4, z: 3.5, w: 1, d: 5, h: 3.6, mat: 'concrete' },
  { x: -2.5, z: -6, w: 3, d: 1, h: 3.6, mat: 'concrete' },
  { x: 2.5, z: -6, w: 3, d: 1, h: 3.6, mat: 'concrete' },
  { x: -2.5, z: 6, w: 3, d: 1, h: 3.6, mat: 'concrete' },
  { x: 2.5, z: 6, w: 3, d: 1, h: 3.6, mat: 'concrete' },
  // Mid platform (vantage) with jumpable steps on its south face
  { x: 0, z: 0, w: 4, d: 4, h: 2.2, mat: 'metal' },
  { x: 0, z: 3.2, w: 2, d: 1, h: 0.75, mat: 'hazard' },
  { x: 0, z: 2.4, w: 2, d: 1, h: 1.5, mat: 'hazard' },
  // Flank cover
  { x: -14, z: 0, w: 2, d: 1, h: 1.2, mat: 'crateWood' },
  { x: 14, z: 0, w: 2, d: 1, h: 1.2, mat: 'crateWood' },
  { x: -8, z: -9, w: 2.4, d: 1.2, h: 1.2, mat: 'crateTeal' },
  { x: 8, z: -9, w: 2.4, d: 1.2, h: 1.2, mat: 'crateTeal' },
  { x: -8, z: 9, w: 2.4, d: 1.2, h: 1.2, mat: 'crateWood' },
  { x: 8, z: 9, w: 2.4, d: 1.2, h: 1.2, mat: 'crateWood' },
  { x: -16, z: 8, w: 1.6, d: 1.6, h: 1.1, mat: 'crateTeal' },
  { x: 16, z: -8, w: 1.6, d: 1.6, h: 1.1, mat: 'crateTeal' },
  // Site B yard: shipping container + crates
  { x: 17, z: 12, w: 6, d: 2.4, h: 2.6, mat: 'crateTeal' },
  { x: 13, z: 9, w: 1.6, d: 1.6, h: 1.1, mat: 'crateWood' },
  { x: 19, z: 15.5, w: 1.6, d: 1.6, h: 1.1, mat: 'crateWood' },
  { x: 12.5, z: 15, w: 2, d: 1, h: 1.2, mat: 'crateTeal' },
];

// Waypoints the bots walk (ground level). Edges are bidirectional.
const WAYPOINTS = [
  [-18, 14], [-18, 8], [-18, 2], [-18, -4], [-16, -12], [-13, -9],
  [-9, -4], [-8, 2], [0, 0], [8, 2], [8, -4], [14, -4],
  [18, -8], [18, -14], [12, 2], [14, 8], [16, 12], [9, 9],
  [-2, 10], [-10, 12], [0, -10], [-4, -10], [12, -12], [18, 2],
];
const EDGES = [
  [0, 1], [1, 2], [2, 3], [3, 4], [3, 5], [5, 4], [5, 6], [6, 7], [7, 8],
  [8, 9], [9, 10], [10, 11], [11, 12], [12, 13], [9, 14], [14, 15], [15, 16],
  [14, 17], [17, 18], [18, 19], [19, 1], [2, 7], [6, 20], [20, 21], [21, 4],
  [20, 10], [22, 12], [22, 11], [23, 12], [23, 14], [8, 20], [8, 18], [15, 17],
];

export const SITES = {
  A: { letter: 'A', minX: -21, maxX: -11, minZ: -17, maxZ: -7, center: [-16, -12] },
  B: { letter: 'B', minX: 11, maxX: 21, minZ: 7, maxZ: 17, center: [16, 12] },
};

export const SPAWNS = {
  // [x, z, yaw] — yaw 0 faces -z (north).
  vanguard: [[-19, 15, 0], [-17, 15, 0], [-19, 13, 0], [-17, 13, 0], [-18, 16.5, 0]],
  jackal: [[17, -15, Math.PI], [19, -15, Math.PI], [17, -13, Math.PI], [19, -13, Math.PI], [18, -16.5, Math.PI]],
};

export function createWorld(scene, textures) {
  const colliders = [];
  const shootables = [];
  const group = new THREE.Group();
  scene.add(group);

  const geoCache = new Map();
  function boxGeometry(w, h, d) {
    const key = `${w}|${h}|${d}`;
    if (!geoCache.has(key)) geoCache.set(key, new THREE.BoxGeometry(w, h, d));
    return geoCache.get(key);
  }

  const materials = {
    concrete: new THREE.MeshStandardMaterial({ map: textures.concrete, roughness: 0.95 }),
    metal: new THREE.MeshStandardMaterial({ map: textures.metal, roughness: 0.6, metalness: 0.45 }),
    crateWood: new THREE.MeshStandardMaterial({ map: textures.crateWood, roughness: 0.9 }),
    crateTeal: new THREE.MeshStandardMaterial({ map: textures.crateTeal, roughness: 0.7, metalness: 0.25 }),
    hazard: new THREE.MeshStandardMaterial({ map: textures.hazard, roughness: 0.8 }),
  };

  // Ground
  const groundMat = new THREE.MeshStandardMaterial({ map: textures.floor, roughness: 0.96 });
  textures.floor.repeat.set(11, 9);
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(46, 38), groundMat);
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  group.add(ground);
  shootables.push(ground);
  colliders.push(new THREE.Box3(new THREE.Vector3(-23, -1, -19), new THREE.Vector3(23, 0, 19)));

  for (const b of BOXES) {
    const y = b.y ?? 0;
    const mat = materials[b.mat].clone();
    // Scale the texture repeat to the face size so it never stretches.
    if (mat.map) {
      mat.map = mat.map.clone();
      mat.map.needsUpdate = true;
      mat.map.repeat.set(Math.max(1, Math.round(b.w / 3)), Math.max(1, Math.round(b.h / 3)));
    }
    const mesh = new THREE.Mesh(boxGeometry(b.w, b.h, b.d), mat);
    mesh.position.set(b.x, y + b.h / 2, b.z);
    mesh.castShadow = b.h > 1.5;
    mesh.receiveShadow = true;
    group.add(mesh);
    shootables.push(mesh);
    colliders.push(new THREE.Box3(
      new THREE.Vector3(b.x - b.w / 2, y, b.z - b.d / 2),
      new THREE.Vector3(b.x + b.w / 2, y + b.h, b.z + b.d / 2),
    ));
  }

  // Barrels (visual + collider as a box).
  const barrelGeo = new THREE.CylinderGeometry(0.42, 0.42, 1.1, 12);
  const barrelMat = new THREE.MeshStandardMaterial({ color: 0x8a4a2a, roughness: 0.6, metalness: 0.4 });
  for (const [x, z] of [[-6, -12], [6, 12], [-20, 4], [20, -4]]) {
    const barrel = new THREE.Mesh(barrelGeo, barrelMat);
    barrel.position.set(x, 0.55, z);
    barrel.castShadow = true;
    group.add(barrel);
    shootables.push(barrel);
    colliders.push(new THREE.Box3(new THREE.Vector3(x - 0.42, 0, z - 0.42), new THREE.Vector3(x + 0.42, 1.1, z + 0.42)));
  }

  // Floating site markers.
  const markers = [];
  for (const site of Object.values(SITES)) {
    const tex = site.letter === 'A' ? textures.letterA : textures.letterB;
    const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false }));
    sprite.scale.set(1.6, 1.6, 1);
    sprite.position.set(site.center[0], 4.6, site.center[1]);
    group.add(sprite);
    markers.push(sprite);
    const light = new THREE.PointLight(site.letter === 'A' ? PALETTE.siteA : PALETTE.siteB, 12, 14, 1.8);
    light.position.set(site.center[0], 3.4, site.center[1]);
    group.add(light);
  }

  // Floodlight poles: warm pools of light over mid and both spawn lanes.
  const poleMat = new THREE.MeshStandardMaterial({ color: PALETTE.metalDark, roughness: 0.5, metalness: 0.6 });
  const lampMat = new THREE.MeshStandardMaterial({ color: 0x111111, emissive: PALETTE.accent, emissiveIntensity: 2.2 });
  for (const [x, z] of [[-8, 0], [8, 0], [0, -12], [0, 12]]) {
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.12, 5.4, 8), poleMat);
    pole.position.set(x, 2.7, z);
    group.add(pole);
    const head = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.18, 0.4), lampMat);
    head.position.set(x, 5.4, z);
    group.add(head);
  }
  const midLight = new THREE.PointLight(PALETTE.accent, 30, 26, 1.6);
  midLight.position.set(0, 5, 0);
  group.add(midLight);

  // Dusk skyline silhouettes beyond the walls.
  const skyMat = new THREE.MeshStandardMaterial({ color: 0x1d2230, roughness: 1 });
  const skyline = [[-30, -26, 10, 14], [10, -30, 16, 22], [30, -20, 8, 10], [-32, 12, 12, 18], [32, 18, 14, 12], [0, 28, 20, 16]];
  for (const [x, z, w, h] of skyline) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, w), skyMat);
    m.position.set(x, h / 2 - 1, z);
    group.add(m);
  }

  // Lighting: low warm sun + cool dusk hemisphere.
  const sun = new THREE.DirectionalLight(0xffc98a, 1.6);
  sun.position.set(-18, 26, 14);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.left = -26;
  sun.shadow.camera.right = 26;
  sun.shadow.camera.top = 26;
  sun.shadow.camera.bottom = -26;
  sun.shadow.camera.far = 80;
  sun.shadow.bias = -0.0004;
  scene.add(sun);
  scene.add(new THREE.HemisphereLight(0x8fa3c7, 0x2a2620, 0.85));

  const adjacency = WAYPOINTS.map(() => []);
  for (const [a, b] of EDGES) {
    adjacency[a].push(b);
    adjacency[b].push(a);
  }

  return {
    colliders,
    shootables,
    waypoints: WAYPOINTS.map(([x, z]) => ({ x, z })),
    adjacency,
    sites: SITES,
    spawns: SPAWNS,
    bounds: { minX: -22, maxX: 22, minZ: -18, maxZ: 18 },
    update(_dt, t) {
      // Gentle bob on the site markers so the sites read at a glance.
      markers[0].position.y = 4.6 + Math.sin(t * 1.4) * 0.12;
      markers[1].position.y = 4.6 + Math.sin(t * 1.4 + 2) * 0.12;
    },
  };
}

// Breadth-first path on the waypoint graph, from the node nearest `from` to the
// node nearest `to`. Returns an array of waypoint indices.
export function findPath(world, from, to) {
  let start = 0;
  let goal = 0;
  let best = Infinity;
  let bestGoal = Infinity;
  world.waypoints.forEach((w, i) => {
    const d = (w.x - from.x) ** 2 + (w.z - from.z) ** 2;
    if (d < best) { best = d; start = i; }
    const g = (w.x - to.x) ** 2 + (w.z - to.z) ** 2;
    if (g < bestGoal) { bestGoal = g; goal = i; }
  });
  const prev = new Array(world.waypoints.length).fill(-1);
  const queue = [start];
  prev[start] = start;
  while (queue.length) {
    const node = queue.shift();
    if (node === goal) break;
    for (const next of world.adjacency[node]) {
      if (prev[next] === -1) {
        prev[next] = node;
        queue.push(next);
      }
    }
  }
  if (prev[goal] === -1) return [goal];
  const path = [];
  let node = goal;
  while (node !== start) {
    path.unshift(node);
    node = prev[node];
  }
  path.unshift(start);
  return path;
}

export function nearestWaypoint(world, x, z) {
  let best = 0;
  let bestD = Infinity;
  world.waypoints.forEach((w, i) => {
    const d = (w.x - x) ** 2 + (w.z - z) ** 2;
    if (d < bestD) { bestD = d; best = i; }
  });
  return best;
}
