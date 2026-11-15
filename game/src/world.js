// DUSTWORKS: an original desert freight yard at dusk. Attackers spawn south,
// two bomb sites sit north-west (A, the refinery) and north-east (B, the silo
// yard), joined by three lanes: A Long down the west wall, Mid through the
// container doors, and B Long down the east wall. Every box is both a mesh and
// a collider, so bullets, sight and movement all agree with what you see.
import * as THREE from 'three';
import { PALETTE } from './palette.js';
import { segmentBox, segmentBlocksSight } from './util.js';

const BOXES = [
  // [cx, cz, w, d, h, material] — y sits on the ground unless noted.
  // Perimeter.
  [-32.2, 0, 0.4, 46, 5, 'surface'],
  [32.2, 0, 0.4, 46, 5, 'surface'],
  [0, -22.2, 66, 0.4, 5, 'surface'],
  [0, 22.2, 66, 0.4, 5, 'surface'],
  // Spawn wall with three gaps: west lane, mid, east lane.
  [-12, 14, 16, 0.8, 3.4, 'surface'],
  [12, 14, 16, 0.8, 3.4, 'surface'],
  // West and east warehouses: the long lanes run outside them.
  [-24, -2, 6, 12, 4.6, 'rust'],
  [24, -2, 6, 12, 4.6, 'rust'],
  // Mid container stack and the two blocks that make the mid doors.
  [0, 5, 10, 4, 2.6, 'rust'],
  [-6, -10, 6, 3, 3.2, 'olive'],
  [6, -10, 6, 3, 3.2, 'olive'],
  // Connector corners between the short lanes and mid.
  [-16, -4, 2, 6, 3, 'surface'],
  [16, -4, 2, 6, 3, 'surface'],
  // Site A crates (refinery yard, north-west).
  [-24, -17, 3, 3, 1.1, 'sand'],
  [-18, -19, 2, 2, 2.2, 'rust'],
  [-28, -13, 2, 2, 1.1, 'sand'],
  [-20, -14.5, 1.6, 1.6, 1.1, 'olive'],
  // Site B crates (silo yard, north-east), mirrored.
  [24, -17, 3, 3, 1.1, 'sand'],
  [18, -19, 2, 2, 2.2, 'rust'],
  [28, -13, 2, 2, 1.1, 'sand'],
  [20, -14.5, 1.6, 1.6, 1.1, 'olive'],
  // Mid and spawn cover.
  [-12, 8, 2, 2, 1.1, 'sand'],
  [12, 8, 2, 2, 1.1, 'sand'],
  [-8, -4, 1.6, 1.6, 1.1, 'olive'],
  [8, -4, 1.6, 1.6, 1.1, 'olive'],
  [-8, 18, 2, 2, 1.1, 'sand'],
  [8, 18, 2, 2, 1.1, 'sand'],
  [-29.5, -19, 2.6, 2.6, 5.5, 'olive'],
  [29.5, -19, 2.6, 2.6, 5.5, 'olive'],
];

// Waypoint graph the bots walk. Nodes sit in open lanes; edges are the routes.
const WAYPOINTS = {
  aspawn: [0, 19], aWest: [-26, 18], aEast: [26, 18],
  mid0: [0, 12], mid1: [0, 8], mid2: [0, -2], mid3: [0, -6], midTop: [0, -14],
  aLong1: [-29.5, 12], aLong2: [-29.5, 4], aLong3: [-29.5, -6], aLong4: [-29.5, -12],
  aSite: [-24, -16], aHold: [-25, -14],
  aShort1: [-14, 10], aShort2: [-14, 2], aShort3: [-14, -6], aSite2: [-18, -12],
  bLong1: [29.5, 12], bLong2: [29.5, 4], bLong3: [29.5, -6], bLong4: [29.5, -12],
  bSite: [24, -16], bHold: [25, -14],
  bTun1: [14, 10], bTun2: [14, 2], bTun3: [14, -6], bSite2: [18, -12],
  dMid: [0, -19], dA: [-22, -19], dB: [22, -19],
};
const EDGES = [
  ['aspawn', 'mid0'], ['aspawn', 'aWest'], ['aspawn', 'aEast'],
  ['aWest', 'aLong1'], ['aEast', 'bLong1'],
  ['mid0', 'mid1'], ['mid1', 'mid2'], ['mid2', 'mid3'], ['mid3', 'midTop'],
  ['aLong1', 'aLong2'], ['aLong2', 'aLong3'], ['aLong3', 'aLong4'], ['aLong4', 'aSite'],
  ['mid1', 'aShort1'], ['aShort1', 'aShort2'], ['aShort2', 'aShort3'], ['aShort3', 'aSite2'],
  ['aSite2', 'aSite'], ['mid1', 'bTun1'], ['bTun1', 'bTun2'], ['bTun2', 'bTun3'],
  ['bTun3', 'bSite2'], ['bSite2', 'bSite'],
  ['bLong1', 'bLong2'], ['bLong2', 'bLong3'], ['bLong3', 'bLong4'], ['bLong4', 'bSite'],
  ['midTop', 'dMid'], ['aSite', 'dA'], ['bSite', 'dB'],
  ['midTop', 'aSite2'], ['midTop', 'bSite2'],
  ['dMid', 'dA'], ['dMid', 'dB'], ['aSite2', 'dA'], ['bSite2', 'dB'],
  ['mid2', 'aShort2'], ['mid2', 'bTun2'],
];

export const SITES = {
  A: { minX: -32, maxX: -16, minZ: -22, maxZ: -12, cx: -24, cz: -16.5 },
  B: { minX: 16, maxX: 32, minZ: -22, maxZ: -12, cx: 24, cz: -16.5 },
};

export const SPAWNS = {
  vanguard: [[0, 19], [-3, 19.5], [3, 19.5], [-6, 18], [6, 18]],
  sentinel: [[-22, -19], [-14, -19], [0, -19], [14, -19], [22, -19]],
};

function letterTexture(letter, color) {
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 128;
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, 128, 128);
  ctx.fillStyle = color;
  ctx.font = 'bold 84px sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(letter, 64, 70);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

export function createWorld(scene) {
  const group = new THREE.Group();
  scene.add(group);
  const materials = {};
  for (const name of Object.keys(PALETTE)) {
    materials[name] = new THREE.MeshStandardMaterial({
      color: new THREE.Color(PALETTE[name]),
      roughness: name === 'ink' ? 0.55 : 0.92,
      metalness: 0.03,
    });
  }
  const groundMat = new THREE.MeshStandardMaterial({ color: new THREE.Color('#241b12'), roughness: 1 });
  const colliders = [];
  const shootables = [];
  const scratch = { t: -1 };

  function box(cx, cz, w, d, h, material, yBase = 0) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), materials[material]);
    mesh.position.set(cx, yBase + h / 2, cz);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    group.add(mesh);
    const box3 = new THREE.Box3().setFromObject(mesh);
    colliders.push(box3);
    shootables.push(mesh);
    return mesh;
  }

  // Ground, plus darker floor patches so the yard reads as worn concrete.
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(66, 46), groundMat);
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  group.add(ground);
  const patchMat = new THREE.MeshStandardMaterial({ color: new THREE.Color('#1b140e'), roughness: 1 });
  for (const [px, pz, pw, pd] of [[-20, 8, 14, 8], [16, -6, 12, 10], [0, -16, 18, 6], [-26, -14, 10, 8], [26, -14, 10, 8]]) {
    const patch = new THREE.Mesh(new THREE.PlaneGeometry(pw, pd), patchMat);
    patch.rotation.x = -Math.PI / 2;
    patch.position.set(px, 0.01, pz);
    patch.receiveShadow = true;
    group.add(patch);
  }

  for (const [cx, cz, w, d, h, mat] of BOXES) box(cx, cz, w, d, h, mat);

  // Silo drums in the site corners: cylinders for looks, boxes for collision.
  const siloMat = new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.olive), roughness: 0.6, metalness: 0.25 });
  for (const sx of [-30.8, 30.8]) {
    const silo = new THREE.Mesh(new THREE.CylinderGeometry(1.5, 1.5, 6.4, 18), siloMat);
    silo.position.set(sx, 3.2, -20.5);
    silo.castShadow = true;
    group.add(silo);
  }

  // Site floor decals and floating letters, so a site reads at a glance.
  for (const [key, site] of Object.entries(SITES)) {
    const color = key === 'A' ? PALETTE.accent : PALETTE.teal;
    const decal = new THREE.Mesh(
      new THREE.PlaneGeometry(site.maxX - site.minX - 1, site.maxZ - site.minZ - 1),
      new THREE.MeshBasicMaterial({ color: new THREE.Color(color), transparent: true, opacity: 0.1, depthWrite: false }),
    );
    decal.rotation.x = -Math.PI / 2;
    decal.position.set(site.cx, 0.02, site.cz);
    group.add(decal);
    const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: letterTexture(key, color), transparent: true, depthWrite: false }));
    sprite.scale.set(4, 4, 1);
    sprite.position.set(site.cx, 5.2, site.cz);
    group.add(sprite);
  }

  // Light: low dusk sun from the south-west, cool sky fill, warm bounce.
  scene.add(new THREE.HemisphereLight(new THREE.Color('#ffd9a0'), new THREE.Color('#241a12'), 1.25));
  const sun = new THREE.DirectionalLight(new THREE.Color('#ffb45e'), 2.7);
  sun.position.set(-18, 26, 20);
  sun.target.position.set(0, 0, -4);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.left = -38;
  sun.shadow.camera.right = 38;
  sun.shadow.camera.top = 28;
  sun.shadow.camera.bottom = -28;
  sun.shadow.camera.far = 90;
  sun.shadow.bias = -0.0006;
  scene.add(sun, sun.target);
  const fill = new THREE.DirectionalLight(new THREE.Color('#7a86a8'), 0.65);
  fill.position.set(14, 12, -18);
  scene.add(fill);

  const adjacency = {};
  for (const name of Object.keys(WAYPOINTS)) adjacency[name] = [];
  for (const [a, b] of EDGES) {
    adjacency[a].push(b);
    adjacency[b].push(a);
  }

  return {
    colliders,
    shootables,
    group,
    waypoints: WAYPOINTS,
    adjacency,
    // First world hit along a ray, as a distance, or -1.
    rayWorld(ox, oy, oz, dx, dy, dz, maxDist) {
      let best = -1;
      for (const box3 of colliders) {
        if (segmentBox(ox, oy, oz, dx * maxDist, dy * maxDist, dz * maxDist, box3, scratch) && scratch.t >= 0) {
          const dist = scratch.t * maxDist;
          if (best < 0 || dist < best) best = dist;
        }
      }
      return best;
    },
    // True when no wall tall enough stands between two ground points.
    losClear(x0, z0, x1, z1, eyeY) {
      for (const box3 of colliders) {
        if (segmentBlocksSight(x0, z0, x1, z1, box3, eyeY)) return false;
      }
      return true;
    },
    siteAt(x, z) {
      for (const [key, site] of Object.entries(SITES)) {
        if (x >= site.minX && x <= site.maxX && z >= site.minZ && z <= site.maxZ) return key;
      }
      return null;
    },
  };
}
