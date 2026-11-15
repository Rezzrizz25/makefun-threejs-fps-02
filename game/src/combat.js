// Combat: hitscan bullets, grenades and damage. Bullets are rays against the
// world's boxes and the actors' own hitboxes (a sphere for the head, a box for
// the torso), so a headshot is a geometric fact, not a dice roll. Armour soaks
// half the damage until it breaks. Grenades are real projectiles with gravity
// and bounces; smoke is a sphere that blocks sight for both sides.
import * as THREE from 'three';
import { segmentBox, raySphere } from './util.js';

const HEAD_R = 0.17;
const HEAD_LIFT = 0.14;

export function createCombat(world) {
  const grenades = [];
  const smokes = [];
  const scratch = { t: -1 };
  const headScratch = { t: -1 };

  function torsoBox(actor, out) {
    const p = actor.body.position;
    const h = actor.body.crouching ? 0.95 : 1.35;
    out.min.set(p.x - 0.34, p.y + 0.3, p.z - 0.34);
    out.max.set(p.x + 0.34, p.y + h, p.z + 0.34);
    return out;
  }

  return {
    grenades,
    smokes,
    // One hitscan pellet. Returns a small result object reused by the caller.
    fire(origin, dir, range, shooter, actors, result) {
      result.hit = false;
      result.part = '';
      result.actor = null;
      const wallDist = world.rayWorld(origin.x, origin.y, origin.z, dir.x, dir.y, dir.z, range);
      let best = wallDist < 0 ? range : wallDist;
      let bestActor = null;
      let bestPart = '';
      const torso = { min: new THREE.Vector3(), max: new THREE.Vector3() };
      for (const actor of actors) {
        if (!actor.alive || actor === shooter) continue;
        const p = actor.body.position;
        const headY = p.y + actor.body.height - HEAD_LIFT;
        if (raySphere(origin.x, origin.y, origin.z, dir.x, dir.y, dir.z, p.x, headY, p.z, HEAD_R, headScratch) && headScratch.t < best) {
          best = headScratch.t;
          bestActor = actor;
          bestPart = 'head';
        }
        torsoBox(actor, torso);
        if (segmentBox(origin.x, origin.y, origin.z, dir.x * range, dir.y * range, dir.z * range, torso, scratch) && scratch.t >= 0 && scratch.t * range < best) {
          best = scratch.t * range;
          bestActor = actor;
          bestPart = 'torso';
        }
      }
      result.dist = best;
      result.px = origin.x + dir.x * best;
      result.py = origin.y + dir.y * best;
      result.pz = origin.z + dir.z * best;
      if (bestActor) {
        result.hit = true;
        result.actor = bestActor;
        result.part = bestPart;
      }
      return result;
    },
    damage(actor, amount) {
      if (!actor.alive) return 0;
      const absorbed = Math.min(actor.armor, amount * 0.5);
      actor.armor -= absorbed;
      const dealt = amount - absorbed;
      actor.health -= dealt;
      if (actor.health <= 0) {
        actor.health = 0;
        actor.alive = false;
      }
      return dealt;
    },
    throwGrenade(kind, owner, origin, dir) {
      grenades.push({
        kind, owner,
        x: origin.x, y: origin.y, z: origin.z,
        vx: dir.x * 14 + owner.body.velocity.x * 0.4,
        vy: dir.y * 14 + 3.2,
        vz: dir.z * 14 + owner.body.velocity.z * 0.4,
        fuse: kind === 'frag' ? 1.6 : 1.1,
      });
    },
    // True when a smoke cloud stands between two ground points at eye height.
    smokeBlocks(x0, z0, x1, z1) {
      for (const smoke of smokes) {
        const dx = x1 - x0;
        const dz = z1 - z0;
        const len2 = dx * dx + dz * dz;
        if (len2 < 1e-6) continue;
        let t = ((smoke.x - x0) * dx + (smoke.z - z0) * dz) / len2;
        t = Math.max(0, Math.min(1, t));
        const cx = x0 + dx * t;
        const cz = z0 + dz * t;
        const dist2 = (cx - smoke.x) * (cx - smoke.x) + (cz - smoke.z) * (cz - smoke.z);
        if (dist2 < smoke.r * smoke.r) return true;
      }
      return false;
    },
    // Advances grenades; calls hooks.explode / hooks.smoke when one goes off.
    stepGrenades(dt, actors, hooks, now) {
      for (let i = grenades.length - 1; i >= 0; i -= 1) {
        const g = grenades[i];
        g.fuse -= dt;
        g.vy -= 16 * dt;
        let nx = g.x + g.vx * dt;
        let ny = g.y + g.vy * dt;
        let nz = g.z + g.vz * dt;
        if (ny < 0.08) {
          ny = 0.08;
          g.vy = -g.vy * 0.4;
          g.vx *= 0.7;
          g.vz *= 0.7;
        }
        let blocked = false;
        for (const box of world.colliders) {
          if (nx > box.min.x && nx < box.max.x && ny > box.min.y && ny < box.max.y && nz > box.min.z && nz < box.max.z) {
            blocked = true;
            break;
          }
        }
        if (blocked) {
          g.vx *= -0.4;
          g.vy *= 0.4;
          g.vz *= -0.4;
          nx = g.x;
          ny = g.y;
          nz = g.z;
        }
        g.x = nx;
        g.y = ny;
        g.z = nz;
        if (g.fuse > 0) continue;
        grenades.splice(i, 1);
        if (g.kind === 'frag') {
          hooks.explode(g.x, g.y, g.z);
          for (const actor of actors) {
            if (!actor.alive || actor === g.owner) continue;
            const p = actor.body.position;
            const dx = p.x - g.x;
            const dy = p.y + 0.9 - g.y;
            const dz = p.z - g.z;
            const dist = Math.hypot(dx, dy, dz);
            if (dist > 8) continue;
            let dmg = 105 - dist * 10;
            if (!world.losClear(g.x, g.z, p.x, p.z, 1.2)) dmg *= 0.45;
            if (dmg > 5) hooks.damageActor(actor, dmg, g.owner, 'frag');
          }
        } else {
          smokes.push({ x: g.x, z: g.z, r: 3.4, until: now + 13 });
          hooks.smoke(g.x, g.y, g.z);
        }
      }
      for (let i = smokes.length - 1; i >= 0; i -= 1) {
        if (now > smokes[i].until) smokes.splice(i, 1);
      }
    },
  };
}
