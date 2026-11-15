// Bot AI: nine bots that walk waypoint routes, hold angles, react to what they
// see and hear, and play the objective. A bot thinks every 0.15 s (routes,
// target choice, plant/defuse) and aims and fires every fixed step in between.
// Vision is a cone plus a real line-of-sight test against the world's boxes
// and the smoke clouds; hearing is a noise radius around every gunshot.
import * as THREE from 'three';
import { createMover } from './mover.js';
import { WEAPONS } from './weapons.js';
import { clamp, mulberry32 } from './util.js';

const NAMES = {
  vanguard: ['Rook', 'Havoc', 'Mira', 'Dune'],
  sentinel: ['Bastion', 'Gravel', 'Warden', 'Sable', 'Flint'],
};
const ROUTES = {
  A_LONG: ['aspawn', 'aWest', 'aLong1', 'aLong2', 'aLong3', 'aLong4', 'aSite'],
  A_SHORT: ['aspawn', 'mid0', 'mid1', 'aShort1', 'aShort2', 'aShort3', 'aSite2', 'aSite'],
  MID_A: ['aspawn', 'mid0', 'mid1', 'mid2', 'mid3', 'midTop', 'aSite2', 'aSite'],
  MID_B: ['aspawn', 'mid0', 'mid1', 'mid2', 'mid3', 'midTop', 'bSite2', 'bSite'],
  B_LONG: ['aspawn', 'aEast', 'bLong1', 'bLong2', 'bLong3', 'bLong4', 'bSite'],
  B_TUN: ['aspawn', 'mid0', 'mid1', 'bTun1', 'bTun2', 'bTun3', 'bSite2', 'bSite'],
};
const ATTACK_ROUTES = ['A_LONG', 'A_SHORT', 'MID_A', 'MID_B', 'B_LONG', 'B_TUN'];
const DEFEND_POSTS = [
  { wp: 'aHold', yaw: Math.PI * 0.5, site: 'A' },
  { wp: 'aSite2', yaw: Math.PI * 0.75, site: 'A' },
  { wp: 'bHold', yaw: -Math.PI * 0.5, site: 'B' },
  { wp: 'bSite2', yaw: -Math.PI * 0.75, site: 'B' },
  { wp: 'midTop', yaw: Math.PI, site: null },
];
const BOT_GUNS = ['rifle', 'rifle', 'smg', 'rifle', 'shotgun'];
const VIEW_DIST = 42;
const FOV_COS = Math.cos(1.05);

function buildMesh(team) {
  const color = team === 'vanguard' ? 0xff9d2e : 0x2ec4b6;
  const group = new THREE.Group();
  const suit = new THREE.MeshStandardMaterial({ color, roughness: 0.7, metalness: 0.1 });
  const dark = new THREE.MeshStandardMaterial({ color: 0x23211d, roughness: 0.85 });
  const skin = new THREE.MeshStandardMaterial({ color: 0xc9a186, roughness: 0.7 });
  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.52, 0.72, 0.3), suit);
  torso.position.y = 1.05;
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.16, 14, 10), skin);
  head.position.y = 1.56;
  const helmet = new THREE.Mesh(new THREE.SphereGeometry(0.18, 14, 10, 0, Math.PI * 2, 0, 1.2), dark);
  helmet.position.y = 1.58;
  const legL = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.62, 0.2), dark);
  legL.position.set(-0.14, 0.31, 0);
  const legR = legL.clone();
  legR.position.x = 0.14;
  const gun = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.09, 0.62), dark);
  gun.position.set(0.2, 1.15, -0.3);
  group.add(torso, head, helmet, legL, legR, gun);
  group.traverse((mesh) => {
    if (mesh.isMesh) {
      mesh.castShadow = true;
    }
  });
  return { group, legL, legR, gun };
}

export function createBots(scene, world) {
  const actors = [];
  let rng = mulberry32(1);

  function spawnBot(team, index, spawn) {
    const [x, z] = spawn;
    const yaw = team === 'vanguard' ? 0 : Math.PI;
    const mover = createMover(world.colliders, x, z, yaw);
    const mesh = buildMesh(team);
    scene.add(mesh.group);
    const gunKey = BOT_GUNS[index % BOT_GUNS.length];
    const bot = {
      id: `${team}-${index}`,
      name: NAMES[team][index % NAMES[team].length],
      team,
      isPlayer: false,
      mover,
      body: mover.body,
      health: 100,
      armor: 0,
      alive: true,
      gun: gunKey,
      mag: WEAPONS[gunKey].mag,
      reserve: WEAPONS[gunKey].reserve,
      cooldown: 0,
      reloadLeft: 0,
      burstLeft: 0,
      burstPause: 0,
      mode: 'route',
      route: [],
      routeIndex: 0,
      holdWp: null,
      holdYaw: 0,
      holdUntil: 0,
      enemy: null,
      lastSeenX: 0,
      lastSeenZ: 0,
      lastSeenAt: -99,
      reactAt: 0,
      aimYaw: yaw,
      aimPitch: 0,
      aimError: 0,
      strafe: 0,
      strafeUntil: 0,
      crouch: false,
      nextThink: 0,
      walkPhase: Math.random() * 6,
      fall: 0,
      mesh,
    };
    actors.push(bot);
    return bot;
  }

  function visibleEnemy(bot, others, now) {
    const eyeY = bot.body.position.y + bot.body.eye;
    let best = null;
    let bestDist = VIEW_DIST;
    for (const other of others) {
      if (!other.alive || other.team === bot.team) continue;
      const dx = other.body.position.x - bot.body.position.x;
      const dz = other.body.position.z - bot.body.position.z;
      const dist = Math.hypot(dx, dz);
      if (dist > bestDist) continue;
      const fx = -Math.sin(bot.aimYaw);
      const fz = -Math.cos(bot.aimYaw);
      const dot = (dx * fx + dz * fz) / (dist || 1);
      const recentlySeen = now - bot.lastSeenAt < 1.2 && other === bot.enemy;
      if (dot < FOV_COS && !recentlySeen) continue;
      if (!world.losClear(bot.body.position.x, bot.body.position.z, other.body.position.x, other.body.position.z, eyeY)) continue;
      // Smoke hides a target that is not already point-blank.
      if (dist > 6 && world.smokeBlocks && world.smokeBlocks(bot.body.position.x, bot.body.position.z, other.body.position.x, other.body.position.z)) continue;
      best = other;
      bestDist = dist;
    }
    return best;
  }

  function think(bot, ctx, now) {
    const { state, others } = ctx;
    if (state.phase === 'freeze' || state.phase === 'menu') {
      bot.mode = 'hold';
      return;
    }
    const enemy = visibleEnemy(bot, others, now);
    if (enemy) {
      if (bot.enemy !== enemy) {
        bot.reactAt = now + 0.35 + rng() * 0.3;
        bot.lastSeenX = enemy.body.position.x;
        bot.lastSeenZ = enemy.body.position.z;
        bot.lastSeenAt = now;
      }
      bot.enemy = enemy;
      bot.mode = 'engage';
      return;
    }
    if (bot.enemy && now - bot.lastSeenAt < 2.5) {
      bot.mode = 'engage';
      return;
    }
    bot.enemy = null;
    if (state.bomb.state === 'planted') {
      if (bot.team === 'sentinel') {
        bot.mode = 'defuse';
        bot.route = [nearestWp(bot, state.bomb.x, state.bomb.z)];
        bot.routeIndex = 0;
      } else {
        bot.mode = 'hold';
        bot.holdWp = bot.targetSite === 'A' ? 'aSite' : 'bSite';
      }
      return;
    }
    if (bot.team === 'sentinel') {
      if (!bot.holdWp) {
        const post = DEFEND_POSTS[actors.filter((a) => a.team === 'sentinel').indexOf(bot) % DEFEND_POSTS.length];
        bot.holdWp = post.wp;
        bot.holdYaw = post.yaw;
        bot.targetSite = post.site;
        bot.mode = 'hold';
      } else if (bot.mode === 'route' && bot.routeIndex >= bot.route.length) {
        // Finished investigating a sound: back to the post.
        bot.mode = 'hold';
      } else if (bot.mode !== 'route' && bot.mode !== 'hold') {
        bot.mode = 'hold';
      }
      return;
    }
    // Vanguard: walk the route to the chosen site.
    if (bot.routeIndex >= bot.route.length) {
      if (bot.carrier && world.siteAt(bot.body.position.x, bot.body.position.z) === bot.targetSite) {
        bot.mode = 'plant';
      } else {
        bot.mode = 'hold';
      }
      return;
    }
    bot.mode = 'route';
  }

  function nearestWp(bot, x, z) {
    let best = 'midTop';
    let bestD = Infinity;
    for (const [name, [wx, wz]] of Object.entries(world.waypoints)) {
      const d = (wx - x) ** 2 + (wz - z) ** 2;
      if (d < bestD) {
        bestD = d;
        best = name;
      }
    }
    return best;
  }

  function stepBot(bot, dt, ctx, now) {
    const { state } = ctx;
    bot.cooldown = Math.max(0, bot.cooldown - dt);
    if (bot.reloadLeft > 0) {
      bot.reloadLeft = Math.max(0, bot.reloadLeft - dt);
      if (bot.reloadLeft === 0) {
        const def = WEAPONS[bot.gun];
        const need = def.mag - bot.mag;
        const take = Math.min(need, bot.reserve);
        bot.mag += take;
        bot.reserve -= take;
      }
    }
    if (!bot.alive) {
      if (bot.fall < 1) {
        bot.fall = Math.min(1, bot.fall + dt / 0.4);
        bot.mesh.group.rotation.x = -bot.fall * 1.45;
      }
      return;
    }
    if (now >= bot.nextThink) {
      bot.nextThink = now + 0.15;
      think(bot, ctx, now);
    }

    let forward = 0;
    let strafe = 0;
    let wantCrouch = false;
    let wantJump = false;
    let targetYaw = bot.aimYaw;

    if (bot.mode === 'engage' && bot.enemy) {
      const e = bot.enemy;
      const ex = bot.enemy.alive ? e.body.position.x : bot.lastSeenX;
      const ez = bot.enemy.alive ? e.body.position.z : bot.lastSeenZ;
      if (bot.enemy.alive) {
        bot.lastSeenX = ex;
        bot.lastSeenZ = ez;
        bot.lastSeenAt = now;
      }
      const dx = ex - bot.body.position.x;
      const dz = ez - bot.body.position.z;
      targetYaw = Math.atan2(-dx, -dz);
      const dist = Math.hypot(dx, dz);
      if (now >= bot.strafeUntil) {
        bot.strafeUntil = now + 0.7 + rng() * 0.8;
        bot.strafe = rng() < 0.5 ? -1 : 1;
        bot.crouch = rng() < 0.25;
      }
      if (dist > 14) forward = 1;
      else if (dist < 4) forward = -0.6;
      strafe = bot.strafe * 0.7;
      wantCrouch = bot.crouch;
    } else if (bot.mode === 'route' && bot.routeIndex < bot.route.length) {
      const [tx, tz] = world.waypoints[bot.route[bot.routeIndex]];
      const dx = tx - bot.body.position.x;
      const dz = tz - bot.body.position.z;
      const dist = Math.hypot(dx, dz);
      if (dist < 1.3) {
        bot.routeIndex += 1;
      } else {
        targetYaw = Math.atan2(-dx, -dz);
        forward = 1;
      }
    } else if (bot.mode === 'hold' && bot.holdWp) {
      const [tx, tz] = world.waypoints[bot.holdWp];
      const dx = tx - bot.body.position.x;
      const dz = tz - bot.body.position.z;
      if (Math.hypot(dx, dz) > 1) {
        targetYaw = Math.atan2(-dx, -dz);
        forward = 1;
      } else {
        targetYaw = bot.holdYaw + Math.sin(now * 0.5 + bot.walkPhase) * 0.5;
      }
    } else if (bot.mode === 'defuse') {
      const dx = state.bomb.x - bot.body.position.x;
      const dz = state.bomb.z - bot.body.position.z;
      if (Math.hypot(dx, dz) > 1.4) {
        targetYaw = Math.atan2(-dx, -dz);
        forward = 1;
      } else {
        targetYaw = Math.atan2(-dx, -dz);
      }
    }

    // Smooth turn toward the target yaw.
    let dyaw = targetYaw - bot.aimYaw;
    while (dyaw > Math.PI) dyaw -= Math.PI * 2;
    while (dyaw < -Math.PI) dyaw += Math.PI * 2;
    bot.aimYaw += clamp(dyaw, -6 * dt, 6 * dt);
    bot.body.yaw = bot.aimYaw;
    if (bot.mode === 'engage' && bot.enemy) {
      const e = bot.enemy;
      const ey = e.body.position.y + e.body.eye;
      const my = bot.body.position.y + bot.body.eye;
      const dx = e.body.position.x - bot.body.position.x;
      const dy = ey - my;
      const dz = e.body.position.z - bot.body.position.z;
      const dist = Math.hypot(dx, dy, dz) || 1;
      bot.aimPitch = Math.asin(clamp(dy / dist, -1, 1));
    } else {
      bot.aimPitch += (0 - bot.aimPitch) * Math.min(1, dt * 4);
    }
    bot.body.pitch = bot.aimPitch;

    bot.mover.step(dt, forward, strafe, wantCrouch, wantJump);

    // Fire in bursts once the reaction delay has passed.
    if (bot.mode === 'engage' && bot.enemy && bot.enemy.alive && now >= bot.reactAt) {
      const def = WEAPONS[bot.gun];
      if (bot.mag === 0 && bot.reloadLeft === 0) {
        bot.reloadLeft = def.reload;
      } else if (bot.burstLeft > 0 && bot.cooldown === 0 && bot.reloadLeft === 0) {
        bot.burstLeft -= 1;
        bot.cooldown = def.gap;
        const dist = Math.hypot(bot.enemy.body.position.x - bot.body.position.x, bot.enemy.body.position.z - bot.body.position.z);
        const speed = Math.hypot(bot.enemy.body.velocity.x, bot.enemy.body.velocity.z);
        const err = 0.02 + dist * 0.0011 + speed * 0.004 + (bot.body.crouching ? -0.008 : 0);
        ctx.shootBot(bot, err);
      } else if (bot.burstLeft === 0) {
        bot.burstPause -= dt;
        if (bot.burstPause <= 0) {
          bot.burstLeft = 3 + Math.floor(rng() * 3);
          bot.burstPause = 0.45 + rng() * 0.45;
        }
      }
    }

    // Walk cycle and mesh sync.
    const speed = bot.mover.groundSpeed();
    bot.walkPhase += dt * (4 + speed * 1.6);
    const swing = Math.min(1, speed / 5) * 0.5;
    bot.mesh.legL.rotation.x = Math.sin(bot.walkPhase) * swing;
    bot.mesh.legR.rotation.x = -Math.sin(bot.walkPhase) * swing;
    bot.mesh.group.position.copy(bot.body.position);
    bot.mesh.group.rotation.y = bot.body.yaw;
  }

  return {
    actors,
    resetRound(seed, vanguardSpawns, sentinelSpawns, state) {
      rng = mulberry32(seed * 7919 + 13);
      // Fresh actors each round: meshes are rebuilt by the caller clearing the old ones.
      actors.length = 0;
      const vanguard = [];
      const sentinel = [];
      for (let i = 0; i < 4; i += 1) {
        const bot = spawnBot('vanguard', i, vanguardSpawns[i + 1]);
        vanguard.push(bot);
      }
      for (let i = 0; i < 5; i += 1) {
        const bot = spawnBot('sentinel', i, sentinelSpawns[i]);
        sentinel.push(bot);
      }
      // Attackers split across routes; the carrier takes the site the team favours.
      const favSite = rng() < 0.55 ? 'A' : 'B';
      const routePool = favSite === 'A' ? ['A_LONG', 'A_SHORT', 'MID_A', 'MID_B'] : ['B_LONG', 'B_TUN', 'MID_B', 'MID_A'];
      vanguard.forEach((bot, i) => {
        const routeKey = routePool[i % routePool.length];
        bot.route = [...ROUTES[routeKey]];
        bot.routeIndex = 0;
        bot.targetSite = ROUTES[routeKey].includes('aSite') && !ROUTES[routeKey].includes('bSite') ? 'A' : 'B';
        bot.mode = 'route';
        bot.carrier = false; // the player carries the charge; a bot only takes it from a drop
      });
      sentinel.forEach((bot, i) => {
        const post = DEFEND_POSTS[i % DEFEND_POSTS.length];
        bot.holdWp = post.wp;
        bot.holdYaw = post.yaw;
        bot.targetSite = post.site;
        bot.mode = 'hold';
        bot.carrier = false;
      });
      return { vanguard, sentinel };
    },
    clearMeshes() {
      for (const bot of actors) scene.remove(bot.mesh.group);
      actors.length = 0;
    },
    step(dt, ctx, now) {
      for (const bot of actors) stepBot(bot, dt, ctx, now);
    },
    hear(x, z, radius, others) {
      for (const bot of actors) {
        if (!bot.alive || bot.mode === 'engage') continue;
        const dx = bot.body.position.x - x;
        const dz = bot.body.position.z - z;
        if (dx * dx + dz * dz > radius * radius) continue;
        // Turn toward the noise and, if idle on defence, walk to investigate.
        bot.aimYaw = Math.atan2(-(x - bot.body.position.x), -(z - bot.body.position.z));
        if (bot.team === 'sentinel' && bot.mode === 'hold') {
          bot.mode = 'route';
          bot.route = [nearestWp(bot, x, z)];
          bot.routeIndex = 0;
        }
      }
    },
    nearestWp,
  };
}
