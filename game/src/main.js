// Boot and the one loop: a fixed 60 Hz simulation feeding a render at the
// display's rate. ?shot=start|play|buy|end with &seed=N sets up a deterministic
// frame for a capture, renders it twice, then freezes it and sets
// window.__shotReady. window.__dustworks exposes the live state for checks.
import * as THREE from 'three';
import { PALETTE } from './palette.js';
import { createWorld, SPAWNS } from './world.js';
import { createState, CONFIG, TEAM_INFO } from './state.js';
import { createMover } from './mover.js';
import { createWeaponSet, WEAPONS } from './weapons.js';
import { createCombat } from './combat.js';
import { createBots } from './bots.js';
import { createRounds } from './rounds.js';
import { createEconomy } from './economy.js';
import { createHud } from './hud.js';
import { createInput } from './input.js';
import { createAudio } from './audio.js';
import { createEffects } from './effects.js';
import { mulberry32, clamp } from './util.js';

const FIXED_STEP = 1 / 60;
const params = new URLSearchParams(window.location.search);
const shot = params.get('shot');
const demo = params.get('demo') === '1'; // attract-mode autopilot: plays the game with no input, for testing
const seed = Number.parseInt(params.get('seed') ?? '1', 10) || 1;
const shotRandom = mulberry32(seed);

window.addEventListener('error', (event) => {
  window.__gameError = String(event.message || event.error);
});

const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
document.getElementById('game').appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(PALETTE.canvas);
scene.fog = new THREE.Fog(new THREE.Color(PALETTE.canvas), 26, 70);
const camera = new THREE.PerspectiveCamera(74, window.innerWidth / window.innerHeight, 0.05, 160);
scene.add(camera);

const state = createState();
state.seed = seed;
const world = createWorld(scene);
const combat = createCombat(world);
world.smokeBlocks = (x0, z0, x1, z1) => combat.smokeBlocks(x0, z0, x1, z1);
const effects = createEffects(scene);
const audio = createAudio();
const hud = createHud();
const economy = createEconomy(state);
const bots = createBots(scene, world);
const input = createInput(renderer.domElement, onLockChange);

// The player: Vanguard, carries the charge, starts with a pistol and $800.
const playerMover = createMover(world.colliders, SPAWNS.vanguard[0][0], SPAWNS.vanguard[0][1], 0);
const playerWeapons = createWeaponSet(camera);
const player = {
  id: 'player',
  name: 'You',
  team: 'vanguard',
  isPlayer: true,
  mover: playerMover,
  body: playerMover.body,
  health: 100,
  armor: 0,
  money: CONFIG.startMoney,
  weapons: playerWeapons,
  alive: true,
  carrier: true,
};
state.player = player;
state.actors = [player];

const direction = new THREE.Vector3();
const muzzle = new THREE.Vector3();
const fireResult = { hit: false, part: '', actor: null, dist: 0, px: 0, py: 0, pz: 0 };
let started = false;
let paused = false;
let frozen = false;
let accumulator = 0;
let lastTime = performance.now();
let elapsed = 0;
let lastBombBeep = -1;
let stepSoundAt = 0;
let minimapAt = 0;
let spectateTarget = null;

function resetActorsForRound() {
  bots.clearMeshes();
  bots.resetRound(seed + state.round, SPAWNS.vanguard, SPAWNS.sentinel, state);
  const [sx, sz] = SPAWNS.vanguard[0];
  playerMover.reset(sx, sz, 0);
  player.health = 100;
  player.armor = 0;
  player.alive = true;
  player.carrier = true;
  player.money = player.money; // money persists across rounds
  playerWeapons.resetRound(true);
  spectateTarget = null;
  state.actors = [player, ...bots.actors];
  state.bots = bots.actors;
}

const rounds = createRounds(state, {
  economy,
  nearestWp: (bot, x, z) => bots.nearestWp(bot, x, z),
  onRoundStart(round) {
    resetActorsForRound();
    if (demo && player.money >= 2700 && !player.weapons.state.primary) economy.buy(player, 'rifle');
    hud.setScore(state.wins.vanguard, state.wins.sentinel, round);
    hud.showBanner(`ROUND ${round}`, round === 1 ? 'Vanguard attacks — plant the charge at A or B.' : 'Freeze time — press B to buy.', 3000);
    hud.setBomb('Charge with you — take it to A or B');
    if (state.phase === 'freeze') hud.setHint('B buy menu · E plant · G frag · T smoke');
  },
  onLive() {
    hud.showBanner('GO GO GO', 'Round live — good hunting.', 1600);
    hud.setHint('');
  },
  onRoundEnd(winner, reason) {
    const info = TEAM_INFO[winner];
    hud.showBanner(`${info.name.toUpperCase()} WINS THE ROUND`, reason, 4000);
    hud.setScore(state.wins.vanguard, state.wins.sentinel, state.round);
    if (winner === 'vanguard') audio.roundWin();
    else audio.roundLose();
    if (document.pointerLockElement) document.exitPointerLock();
  },
  onMatchEnd(winner) {
    const info = TEAM_INFO[winner];
    hud.showOverlay('match', { winner, sub: `Final score ${state.wins.vanguard} – ${state.wins.sentinel}. Vanguard ${state.wins.vanguard} · Sentinel ${state.wins.sentinel}.` });
    if (document.pointerLockElement) document.exitPointerLock();
  },
  onPlanted(site, actor) {
    hud.showBanner('CHARGE PLANTED', `Site ${site} — defend it for ${CONFIG.bombTime} seconds.`, 3000);
    hud.setBomb(`CHARGE PLANTED — Site ${site}`);
    audio.plant();
  },
  onDefused(actor) {
    hud.showBanner('CHARGE DEFUSED', `${actor.name} cut the wires.`, 3000);
    hud.setBomb('Charge defused');
  },
  onDetonate() {
    const b = state.bomb;
    effects.explosion(new THREE.Vector3(b.x, 1, b.z));
    audio.explode();
    hud.setBomb('Charge detonated');
  },
  onBombTick(secondsLeft) {
    const whole = Math.ceil(secondsLeft);
    if (whole !== lastBombBeep) {
      lastBombBeep = whole;
      audio.beep(whole <= 10);
    }
  },
  onPickup(actor) {
    if (actor.isPlayer) hud.setBomb('Charge with you — take it to A or B');
    else hud.setBomb(`Charge with ${actor.name}`);
  },
});

function handleKill(victim, killer, part, cause) {
  hud.killfeed(killer ? killer.name : '—', victim.name, part, killer ? killer.team : null);
  if (killer === player) {
    player.money += CONFIG.killReward;
    audio.hit(true);
    hud.hitMarker(true);
  }
  if (victim === player) {
    audio.hurt();
    hud.damageFlash();
    rounds.dropBomb(player);
    spectateTarget = state.actors.find((a) => a.team === 'vanguard' && a.alive && !a.isPlayer) || null;
    if (document.pointerLockElement) document.exitPointerLock();
    if (state.phase === 'live' || state.phase === 'planted') hud.showOverlay('dead');
  }
  if (victim.carrier) {
    victim.carrier = false;
    if (!victim.isPlayer) rounds.dropBomb(victim);
  }
}

function damageActor(victim, amount, killer, cause) {
  if (!victim.alive) return;
  const dealt = combat.damage(victim, amount);
  if (victim === player && dealt > 0) {
    audio.hurt();
    hud.damageFlash();
  }
  if (killer === player && victim !== player && dealt > 0) {
    audio.hit(false);
    hud.hitMarker(false);
  }
  if (!victim.alive) handleKill(victim, killer, cause === 'frag' ? 'frag' : 'torso', cause);
}

// One hitscan pellet from origin along dir, with spread already applied.
function shootPellet(origin, dir, def, shooter) {
  combat.fire(origin, dir, def.range, shooter, state.actors, fireResult);
  muzzle.copy(origin);
  const end = new THREE.Vector3(fireResult.px, fireResult.py, fireResult.pz);
  effects.tracer(muzzle, end);
  if (fireResult.hit) {
    const dmg = def.damage * (fireResult.part === 'head' ? def.headMult : 1);
    damageActor(fireResult.actor, dmg, shooter, fireResult.part);
  } else if (fireResult.dist < def.range) {
    effects.impact(end, 4);
  }
  return fireResult.hit;
}

function playerShoot() {
  const def = playerWeapons.def();
  if (!playerWeapons.takeRound()) {
    audio.dryClick();
    playerWeapons.reload();
    return;
  }
  camera.getWorldDirection(direction);
  const spread = shot ? 0 : playerWeapons.spread(playerMover.groundSpeed());
  const origin = new THREE.Vector3().copy(camera.position);
  for (let p = 0; p < def.pellets; p += 1) {
    const dir = new THREE.Vector3(
      direction.x + (Math.random() * 2 - 1) * spread,
      direction.y + (Math.random() * 2 - 1) * spread,
      direction.z + (Math.random() * 2 - 1) * spread,
    ).normalize();
    shootPellet(origin, dir, def, player);
  }
  playerWeapons.pullTrigger();
  playerMover.recoil(0.009 + def.kick * 0.5, (Math.random() * 2 - 1) * def.kick * 0.4);
  audio.shot(def.key, false);
  bots.hear(player.body.position.x, player.body.position.z, 30);
  hud.setAmmo(playerWeapons.ammo().mag, playerWeapons.ammo().reserve, def.name);
}

function botShoot(bot, err) {
  const def = WEAPONS[bot.gun];
  if (bot.mag <= 0) return;
  bot.mag -= 1;
  const origin = new THREE.Vector3(bot.body.position.x, bot.body.position.y + bot.body.eye - 0.1, bot.body.position.z);
  const dir = new THREE.Vector3(
    -Math.sin(bot.aimYaw) * Math.cos(bot.aimPitch) + (Math.random() * 2 - 1) * err,
    Math.sin(bot.aimPitch) + (Math.random() * 2 - 1) * err,
    -Math.cos(bot.aimYaw) * Math.cos(bot.aimPitch) + (Math.random() * 2 - 1) * err,
  ).normalize();
  combat.fire(origin, dir, def.range, bot, state.actors, fireResult);
  effects.tracer(origin, new THREE.Vector3(fireResult.px, fireResult.py, fireResult.pz));
  if (fireResult.hit) {
    const dmg = def.damage * (fireResult.part === 'head' ? def.headMult : 1);
    damageActor(fireResult.actor, dmg, bot, fireResult.part);
  } else if (fireResult.dist < def.range) {
    effects.impact(new THREE.Vector3(fireResult.px, fireResult.py, fireResult.pz), 3);
  }
  audio.shot(def.key, true);
  bots.hear(bot.body.position.x, bot.body.position.z, 26);
}

function throwGrenade(kind) {
  const count = playerWeapons.state.grenades[kind];
  if (!count) {
    audio.denied();
    return;
  }
  playerWeapons.state.grenades[kind] -= 1;
  camera.getWorldDirection(direction);
  const origin = new THREE.Vector3().copy(camera.position);
  combat.throwGrenade(kind, player, origin, direction);
  audio.buy();
}

// Demo autopilot: plays the player's seat with no input, so a headless run can
// prove a whole round plays out — walk to Site A, shoot what it sees, plant.
const DEMO_ROUTE = ['mid0', 'mid1', 'mid2', 'mid3', 'midTop', 'aSite2', 'aSite'];
let demoWp = 0;
function autopilot(dt) {
  const out = { forward: 0, strafe: 0, crouch: false };
  const eyeY = player.body.position.y + player.body.eye;
  let target = null;
  let bestD = 40;
  for (const a of state.actors) {
    if (!a.alive || a.team === player.team) continue;
    const dx = a.body.position.x - player.body.position.x;
    const dz = a.body.position.z - player.body.position.z;
    const d = Math.hypot(dx, dz);
    if (d > bestD) continue;
    if (!world.losClear(player.body.position.x, player.body.position.z, a.body.position.x, a.body.position.z, eyeY)) continue;
    target = a;
    bestD = d;
  }
  if (target) {
    const dx = target.body.position.x - player.body.position.x;
    const dy = target.body.position.y + 1.1 - (player.body.position.y + player.body.eye);
    const dz = target.body.position.z - player.body.position.z;
    const wantYaw = Math.atan2(-dx, -dz);
    let dyaw = wantYaw - player.body.yaw;
    while (dyaw > Math.PI) dyaw -= Math.PI * 2;
    while (dyaw < -Math.PI) dyaw += Math.PI * 2;
    player.body.yaw += clamp(dyaw, -6 * dt, 6 * dt);
    const dist = Math.hypot(dx, dy, dz) || 1;
    player.body.pitch = Math.asin(clamp(dy / dist, -1, 1));
    if (Math.abs(dyaw) < 0.05 && (state.phase === 'live' || state.phase === 'planted')) {
      if (playerWeapons.ammo().mag === 0) playerWeapons.reload();
      else if (playerWeapons.ready()) playerShoot();
    }
    return out;
  }
  const site = world.siteAt(player.body.position.x, player.body.position.z);
  if (site === 'A' && state.bomb.state === 'carried' && state.bomb.carrier === player) {
    input.state.keys.add('KeyE');
    return out;
  }
  input.state.keys.delete('KeyE');
  if (demoWp >= DEMO_ROUTE.length) demoWp = 0;
  const [tx, tz] = world.waypoints[DEMO_ROUTE[demoWp]];
  const dx = tx - player.body.position.x;
  const dz = tz - player.body.position.z;
  if (Math.hypot(dx, dz) < 1.5) {
    demoWp += 1;
    return out;
  }
  const wantYaw = Math.atan2(-dx, -dz);
  let dyaw = wantYaw - player.body.yaw;
  while (dyaw > Math.PI) dyaw -= Math.PI * 2;
  while (dyaw < -Math.PI) dyaw += Math.PI * 2;
  player.body.yaw += clamp(dyaw, -6 * dt, 6 * dt);
  out.forward = 1;
  return out;
}

function syncCamera() {
  if (player.alive) {
    camera.position.set(player.body.position.x, player.body.position.y + player.body.eye, player.body.position.z);
    camera.rotation.set(player.body.pitch, player.body.yaw, 0, 'YXZ');
  } else if (spectateTarget && spectateTarget.alive) {
    const b = spectateTarget.body;
    camera.position.set(b.position.x, b.position.y + b.eye, b.position.z);
    camera.rotation.set(b.pitch, b.yaw, 0, 'YXZ');
  }
}

function step(dt) {
  elapsed += dt;
  if (state.phase === 'menu' || state.phase === 'matchEnd') return;
  if (paused) return;

  // Player movement and look: human input, or the demo autopilot.
  if (player.alive) {
    let forward = 0;
    let strafe = 0;
    let crouch = false;
    let jump = false;
    if (demo) {
      const auto = autopilot(dt);
      forward = auto.forward;
      strafe = auto.strafe;
      crouch = auto.crouch;
    } else {
      const look = input.takeLook();
      const sens = playerWeapons.state.scoped ? 0.0011 : 0.0022;
      playerMover.look(look.x, look.y, sens);
      const keys = input.state.keys;
      forward = (keys.has('KeyW') ? 1 : 0) - (keys.has('KeyS') ? 1 : 0);
      strafe = (keys.has('KeyD') ? 1 : 0) - (keys.has('KeyA') ? 1 : 0);
      crouch = keys.has('ControlLeft') || keys.has('ControlRight') || keys.has('KeyC');
      jump = keys.has('Space');
      // Firing, reload, weapon slots, grenades (manual play only, live rounds only).
      if (input.state.locked && (state.phase === 'live' || state.phase === 'planted')) {
        const def = playerWeapons.def();
        if (input.state.firing && playerWeapons.ready() && (def.auto || input.takePressed('Mouse0'))) playerShoot();
        else if (input.state.firing && playerWeapons.ammo().mag === 0) playerWeapons.reload();
        if (input.takePressed('KeyR')) {
          if (playerWeapons.reload()) audio.reload();
        }
        if (input.takePressed('KeyG')) throwGrenade('frag');
        if (input.takePressed('KeyT')) throwGrenade('smoke');
        if (input.takePressed('Digit1') && !state.buyOpen) {
          if (playerWeapons.state.primary) playerWeapons.switchTo(playerWeapons.state.primary);
        }
        if (input.takePressed('Digit2') && !state.buyOpen) playerWeapons.switchTo('pistol');
        if (input.takePressed('KeyB') && state.phase === 'freeze') {
          state.buyOpen = !state.buyOpen;
          hud.showBuy(state.buyOpen);
        }
      }
    }
    playerMover.step(dt, forward, strafe, crouch, jump);
    if (playerMover.groundSpeed() > 2 && elapsed > stepSoundAt) {
      stepSoundAt = elapsed + 0.38;
      audio.footstep();
    }
  } else {
    input.takeLook();
  }
  if (state.buyOpen) {
    for (const item of ['rifle', 'smg', 'shotgun', 'dmr', 'vest', 'frag', 'smoke']) {
      const key = { rifle: 'Digit1', smg: 'Digit2', shotgun: 'Digit3', dmr: 'Digit4', vest: 'Digit5', frag: 'Digit6', smoke: 'Digit7' }[item];
      if (input.takePressed(key)) {
        const msg = economy.buy(player, item);
        if (msg) {
          hud.buyMessage(msg, false);
          audio.denied();
        } else {
          hud.buyMessage(`${item} bought.`, true);
          audio.buy();
          hud.setMoney(player.money);
          hud.setAmmo(playerWeapons.ammo().mag, playerWeapons.ammo().reserve, playerWeapons.def().name);
        }
      }
    }
    if (input.takePressed('KeyB') || input.takePressed('Escape')) {
      state.buyOpen = false;
      hud.showBuy(false);
    }
  }
  if (input.takePressed('KeyM')) {
    state.muted = !state.muted;
    audio.setMuted(state.muted);
  }

  // Scope.
  const wantScope = input.state.aiming && playerWeapons.def().scoped && player.alive;
  playerWeapons.state.scoped = wantScope;
  const targetFov = wantScope ? 32 : 74;
  if (Math.abs(camera.fov - targetFov) > 0.1) {
    camera.fov += (targetFov - camera.fov) * Math.min(1, dt * 10);
    camera.updateProjectionMatrix();
  }

  playerWeapons.step(dt);
  bots.step(dt, { state, others: state.actors, shootBot: botShoot }, elapsed);
  combat.stepGrenades(dt, state.actors, {
    explode: (x, y, z) => {
      effects.explosion(new THREE.Vector3(x, y, z));
      audio.explode();
      bots.hear(x, z, 40);
    },
    smoke: (x, y, z) => {},
    damageActor: (actor, dmg, owner, cause) => damageActor(actor, dmg, owner, cause),
  }, elapsed);
  effects.step(dt);
  effects.syncSmoke(combat.smokes);
  rounds.step(dt, { world, input });
}

function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min((now - lastTime) / 1000, 0.1);
  lastTime = now;
  if (!frozen) {
    accumulator += dt;
    let steps = 0;
    while (accumulator >= FIXED_STEP && steps < 5) {
      step(FIXED_STEP);
      accumulator -= FIXED_STEP;
      steps += 1;
    }
    if (accumulator > FIXED_STEP * 5) accumulator = 0;
    syncCamera();
    // HUD, throttled where it matters.
    if (player.alive) {
      const def = playerWeapons.def();
      const a = playerWeapons.ammo();
      hud.setAmmo(a.mag, a.reserve, def.name);
    }
    hud.setHealth(player.health, player.armor);
    hud.setMoney(player.money);
    const shownTime = state.phase === 'freeze' ? state.freezeTimer : state.phase === 'planted' ? state.bombTimer : state.timer;
    hud.setTimer(shownTime, state.phase === 'planted');
    hud.setScore(state.wins.vanguard, state.wins.sentinel, state.round);
    const vanAlive = state.actors.filter((x) => x.team === 'vanguard' && x.alive).length;
    const senAlive = state.actors.filter((x) => x.team === 'sentinel' && x.alive).length;
    hud.setAlive(vanAlive, senAlive);
    hud.setCrosshair(6 + playerWeapons.spread(playerMover.groundSpeed()) * 900 + (playerWeapons.state.scoped ? -3 : 0));
    if (state.bomb.state === 'planted') hud.setBomb(`CHARGE PLANTED — Site ${state.bomb.site}`);
    else if (state.bomb.state === 'dropped') hud.setBomb('Charge dropped — pick it up');
    if (rounds.planting) hud.setHint(`Planting… ${Math.round(state.bomb.progress * 100)}%`);
    else if (rounds.defusing) hud.setHint(`Defuse in progress… ${Math.round(state.bomb.progress * 100)}%`);
    if (elapsed > minimapAt) {
      minimapAt = elapsed + 0.25;
      hud.drawMinimap(state.actors, state.bomb, world);
    }
  }
  renderer.render(scene, camera);
}

function onLockChange(locked) {
  if (shot) return;
  if (locked) {
    started = true;
    paused = false;
    input.consumePressed();
    hud.hideOverlay();
    audio.unlock();
    if (state.phase === 'menu') rounds.startMatch();
  } else if (started && state.phase !== 'matchEnd') {
    paused = true;
    hud.showOverlay(player.alive ? 'paused' : 'dead');
  }
}

hud.onPlay(() => {
  if (shot) return;
  if (state.phase === 'matchEnd') {
    hud.hideOverlay();
    rounds.startMatch();
    input.requestLock();
    return;
  }
  audio.unlock();
  input.requestLock();
});
hud.onBuy((itemId) => {
  if (state.phase !== 'freeze') return;
  const msg = economy.buy(player, itemId);
  if (msg) {
    hud.buyMessage(msg, false);
    audio.denied();
  } else {
    hud.buyMessage('Bought.', true);
    audio.buy();
    hud.setMoney(player.money);
    hud.setAmmo(playerWeapons.ammo().mag, playerWeapons.ammo().reserve, playerWeapons.def().name);
  }
});

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

window.__dustworks = { state, player, CONFIG, input };

function settle(steps) {
  for (let i = 0; i < steps; i += 1) step(FIXED_STEP);
}

function paintTwiceThenReady() {
  let painted = 0;
  function paint() {
    requestAnimationFrame(paint);
    syncCamera();
    renderer.render(scene, camera);
    painted += 1;
    if (painted === 2) {
      window.__shotReady = true;
      frozen = true;
    }
  }
  requestAnimationFrame(paint);
}

function aimAt(x, y, z) {
  const p = player.body.position;
  const dx = x - p.x;
  const dy = y - (p.y + player.body.eye);
  const dz = z - p.z;
  const len = Math.hypot(dx, dy, dz) || 1;
  player.body.yaw = Math.atan2(-dx, -dz);
  player.body.pitch = Math.asin(clamp(dy / len, -1, 1));
  syncCamera();
}

function runShot(name) {
  hud.hideOverlay();
  hud.showBuy(false);
  state.buyOpen = false;
  if (name === 'start') {
    playerMover.reset(0, 19, 0);
    aimAt(0, 1.6, -14);
    hud.showOverlay('start');
    hud.setScore(0, 0, 1);
    hud.setAmmo(12, 48, 'Kestrel P9');
    hud.setMoney(800);
    hud.setTimer(100, false);
  } else {
    rounds.startMatch();
    settle(10);
    if (name === 'buy') {
      playerMover.reset(0, 19, 0);
      aimAt(0, 1.6, -14);
      state.buyOpen = true;
      hud.showBuy(true);
      hud.setMoney(800);
      hud.setTimer(state.freezeTimer, false);
      hud.hideBanner();
    } else if (name === 'play') {
      state.phase = 'live';
      state.timer = 80;
      hud.setTimer(80, false);
      hud.hideBanner();
      playerMover.reset(0, -2, 0);
      const target = state.actors.find((a) => !a.isPlayer && a.team === 'sentinel' && Math.abs(a.body.position.x) < 5);
      if (target) {
        target.health = 30;
        aimAt(target.body.position.x, target.body.position.y + 1.2, target.body.position.z);
        playerWeapons.buy('rifle');
        settle(6);
        playerShoot();
        settle(8);
      }
      hud.setAmmo(playerWeapons.ammo().mag, playerWeapons.ammo().reserve, playerWeapons.def().name);
      hud.setMoney(player.money);
    } else if (name === 'end') {
      state.wins = { vanguard: 3, sentinel: 2 };
      state.round = 6;
      state.phase = 'roundEnd';
      state.timer = 4;
      for (const a of state.actors) {
        if (a.team === 'sentinel') {
          a.alive = false;
          a.body.position.set(-24 + (a.id.charCodeAt(a.id.length - 1) % 4), 0, -15 - (a.id.charCodeAt(a.id.length - 1) % 3));
          a.fall = 1;
          a.mesh.group.rotation.x = -1.45;
          a.mesh.group.position.copy(a.body.position);
        }
      }
      playerMover.reset(-18, -6, 0);
      aimAt(-24, 1.2, -16);
      hud.setScore(3, 2, 6);
      hud.setTimer(4, false);
      hud.showBanner('VANGUARD WINS THE ROUND', 'Sentinel eliminated.', 60000);
      hud.setBomb('Charge with you — take it to A or B');
    }
  }
  hud.drawMinimap(state.actors, state.bomb, world);
  paintTwiceThenReady();
}

syncCamera();
hud.setAmmo(12, 48, 'Kestrel P9');
hud.setMoney(CONFIG.startMoney);
hud.setTimer(CONFIG.roundTime, false);
if (shot) runShot(shot);
else if (demo) {
  hud.hideOverlay();
  started = true;
  rounds.startMatch();
  requestAnimationFrame(frame);
} else {
  hud.showOverlay('start');
  requestAnimationFrame(frame);
}
