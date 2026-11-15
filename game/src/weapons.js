// The armoury: five original weapons and two grenades. Each definition owns its
// numbers; the view model is built once per weapon and toggled on switch, never
// rebuilt mid-round. Spread grows with movement and with sustained fire, so
// stopping to aim pays, exactly as the bounty asks.
import * as THREE from 'three';
import { PALETTE } from './palette.js';

export const WEAPONS = {
  pistol: { key: 'pistol', slot: 2, name: 'Kestrel P9', kind: 'Pistol', price: 300, damage: 26, headMult: 4, mag: 12, reserve: 48, gap: 0.16, reload: 1.3, spreadStill: 0.004, spreadMove: 0.03, kick: 0.008, pellets: 1, auto: false, range: 60 },
  smg: { key: 'smg', slot: 1, name: 'Hornet-9', kind: 'SMG', price: 1200, damage: 22, headMult: 4, mag: 28, reserve: 112, gap: 0.07, reload: 1.8, spreadStill: 0.006, spreadMove: 0.035, kick: 0.006, pellets: 1, auto: true, range: 55 },
  rifle: { key: 'rifle', slot: 1, name: 'Raptor AR-7', kind: 'Rifle', price: 2700, damage: 33, headMult: 4, mag: 30, reserve: 90, gap: 0.096, reload: 1.9, spreadStill: 0.0022, spreadMove: 0.028, kick: 0.009, pellets: 1, auto: true, range: 80 },
  shotgun: { key: 'shotgun', slot: 1, name: 'Breacher-12', kind: 'Shotgun', price: 1800, damage: 11, headMult: 4, mag: 6, reserve: 24, gap: 0.8, reload: 2.6, spreadStill: 0.03, spreadMove: 0.05, kick: 0.02, pellets: 8, auto: false, range: 30 },
  dmr: { key: 'dmr', slot: 1, name: 'Falcon DMR', kind: 'Marksman', price: 4200, damage: 72, headMult: 4, mag: 10, reserve: 30, gap: 0.5, reload: 2.4, spreadStill: 0.001, spreadMove: 0.02, kick: 0.02, pellets: 1, auto: false, range: 120, scoped: true },
};

export const GRENADES = {
  frag: { key: 'frag', name: 'Spark-9 frag', price: 300 },
  smoke: { key: 'smoke', name: 'Veil smoke', price: 300 },
};

const MUZZLE_TIME = 0.06;

function buildModel(def) {
  const dark = new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.hairline), roughness: 0.7, metalness: 0.2 });
  const metal = new THREE.MeshStandardMaterial({ color: new THREE.Color('#3d362c'), roughness: 0.45, metalness: 0.5 });
  const wood = new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.rust), roughness: 0.8, metalness: 0.05 });
  const group = new THREE.Group();
  const barrelLen = def.key === 'dmr' ? 0.62 : def.key === 'shotgun' ? 0.5 : def.key === 'smg' ? 0.3 : def.key === 'pistol' ? 0.22 : 0.42;
  const receiver = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.1, 0.42), metal);
  const barrel = new THREE.Mesh(new THREE.BoxGeometry(0.045, 0.045, barrelLen), dark);
  barrel.position.set(0, 0.025, -0.2 - barrelLen / 2);
  const stock = new THREE.Mesh(new THREE.BoxGeometry(0.075, 0.08, 0.22), def.key === 'rifle' || def.key === 'dmr' ? wood : dark);
  stock.position.set(0, -0.02, 0.3);
  group.add(receiver, barrel, stock);
  if (def.key === 'dmr') {
    const scope = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.2, 12), dark);
    scope.rotation.x = Math.PI / 2;
    scope.position.set(0, 0.09, -0.05);
    group.add(scope);
  }
  if (def.key === 'shotgun') {
    const tube = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.42, 10), dark);
    tube.rotation.x = Math.PI / 2;
    tube.position.set(0, -0.03, -0.32);
    group.add(tube);
  }
  group.position.set(0.3, -0.26, -0.5);
  group.rotation.y = -0.14;
  group.scale.setScalar(0.75);
  return group;
}

export function createWeaponSet(camera) {
  const models = {};
  for (const def of Object.values(WEAPONS)) {
    models[def.key] = buildModel(def);
    models[def.key].visible = false;
    camera.add(models[def.key]);
  }
  const flash = new THREE.Mesh(
    new THREE.PlaneGeometry(0.26, 0.26),
    new THREE.MeshBasicMaterial({ color: new THREE.Color(PALETTE.accent), transparent: true, opacity: 0.9, depthWrite: false, side: THREE.DoubleSide }),
  );
  flash.position.set(0.24, -0.18, -0.95);
  flash.visible = false;
  camera.add(flash);
  const flashLight = new THREE.PointLight(new THREE.Color(PALETTE.accent), 0, 5);
  flashLight.position.set(0.24, -0.16, -0.6);
  camera.add(flashLight);

  const owned = {
    pistol: { mag: WEAPONS.pistol.mag, reserve: WEAPONS.pistol.reserve },
    rifle: null, smg: null, shotgun: null, dmr: null,
  };
  const state = {
    current: 'pistol',
    primary: null,
    cooldown: 0,
    reloadLeft: 0,
    flash: 0,
    kick: 0,
    bloom: 0,
    scoped: false,
    grenades: { frag: 0, smoke: 0 },
  };
  models.pistol.visible = true;

  function def() {
    return WEAPONS[state.current];
  }
  function ammo() {
    return owned[state.current];
  }

  function step(dt) {
    state.cooldown = Math.max(0, state.cooldown - dt);
    state.flash = Math.max(0, state.flash - dt);
    state.bloom = Math.max(0, state.bloom - dt * 0.05);
    state.kick += (0 - state.kick) * Math.min(1, dt * 14);
    const model = models[state.current];
    model.position.z = -0.46 + state.kick;
    model.rotation.x = state.kick * 2.2;
    flash.visible = state.flash > 0;
    flash.rotation.z = state.flash * 30;
    flashLight.intensity = state.flash > 0 ? 18 : 0;
    if (state.reloadLeft > 0) {
      state.reloadLeft = Math.max(0, state.reloadLeft - dt);
      const d = def();
      model.rotation.x = -0.55 * Math.min(1, (d.reload - state.reloadLeft) * 2);
      if (state.reloadLeft === 0) {
        const a = ammo();
        const need = d.mag - a.mag;
        const take = Math.min(need, a.reserve);
        a.mag += take;
        a.reserve -= take;
      }
    }
  }

  return {
    state,
    def,
    ammo,
    owned,
    step,
    ready() {
      const a = ammo();
      return !!a && a.mag > 0 && state.cooldown === 0 && state.reloadLeft === 0;
    },
    pullTrigger() {
      state.cooldown = def().gap;
      state.flash = MUZZLE_TIME;
      state.kick = 0.055 + def().kick;
      state.bloom = Math.min(0.03, state.bloom + def().kick * 0.35);
    },
    takeRound() {
      const a = ammo();
      if (!a || a.mag <= 0) return false;
      a.mag -= 1;
      return true;
    },
    reload() {
      const d = def();
      const a = ammo();
      if (!a || state.reloadLeft > 0 || a.mag === d.mag || a.reserve === 0) return false;
      state.reloadLeft = d.reload;
      return true;
    },
    spread(speed) {
      const d = def();
      const moving = Math.min(1, speed / 5.2);
      return d.spreadStill + moving * d.spreadMove + state.bloom;
    },
    switchTo(key) {
      if (!owned[key] || key === state.current) return false;
      models[state.current].visible = false;
      state.current = key;
      state.reloadLeft = 0;
      state.scoped = false;
      models[key].visible = true;
      return true;
    },
    buy(key) {
      const d = WEAPONS[key];
      if (!d) return false;
      if (d.slot === 1) {
        owned[d.key] = { mag: d.mag, reserve: d.reserve };
        state.primary = d.key;
        this.switchTo(d.key);
      } else {
        owned.pistol = { mag: d.mag, reserve: d.reserve };
      }
      return true;
    },
    buyGrenade(key) {
      state.grenades[key] = (state.grenades[key] || 0) + 1;
      return true;
    },
    resetRound(keepPrimary) {
      if (!keepPrimary) {
        state.primary = null;
        owned.rifle = owned.smg = owned.shotgun = owned.dmr = null;
      }
      owned.pistol = { mag: WEAPONS.pistol.mag, reserve: WEAPONS.pistol.reserve };
      if (state.primary && owned[state.primary]) {
        const d = WEAPONS[state.primary];
        owned[state.primary] = { mag: d.mag, reserve: d.reserve };
      }
      state.grenades = { frag: 0, smoke: 0 };
      state.cooldown = 0;
      state.reloadLeft = 0;
      state.flash = 0;
      state.kick = 0;
      state.bloom = 0;
      state.scoped = false;
      this.switchTo(state.primary && owned[state.primary] ? state.primary : 'pistol');
    },
  };
}
