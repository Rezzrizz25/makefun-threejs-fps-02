// Rounds: freeze time, the live round, the plant, the defuse, the win and the
// next round. The player carries the charge; if the player falls, the charge
// drops and the nearest living Vanguard bot runs to pick it up. First to 8
// rounds takes the match, 15 rounds at most, then sudden death.
import { CONFIG } from './state.js';
import { SPAWNS, SITES } from './world.js';

export function createRounds(state, hooks) {
  let plantProgress = 0;
  let defuseProgress = 0;
  let plantingActor = null;
  let defusingActor = null;

  function aliveOf(team) {
    return state.actors.filter((a) => a.team === team && a.alive);
  }

  function startRound() {
    state.roundWinner = null;
    state.roundReason = '';
    plantProgress = 0;
    defuseProgress = 0;
    plantingActor = null;
    defusingActor = null;
    state.bomb = { state: 'carried', carrier: state.player, site: null, x: 0, z: 0, progress: 0, planter: null, defuser: null };
    state.phase = 'freeze';
    state.freezeTimer = CONFIG.freezeTime;
    state.timer = CONFIG.roundTime;
    state.bombTimer = 0;
    hooks.onRoundStart(state.round);
  }

  function endRound(winner, reason) {
    if (state.phase === 'roundEnd' || state.phase === 'matchEnd') return;
    state.roundWinner = winner;
    state.roundReason = reason;
    state.wins[winner] += 1;
    hooks.economy.roundPayout(winner);
    state.phase = 'roundEnd';
    state.timer = 4.5;
    hooks.onRoundEnd(winner, reason);
    const toWin = CONFIG.roundsToWin;
    const maxed = state.round >= CONFIG.maxRounds;
    if (state.wins[winner] >= toWin || (maxed && state.wins.vanguard !== state.wins.sentinel)) {
      state.matchWinner = state.wins.vanguard > state.wins.sentinel ? 'vanguard' : 'sentinel';
      state.phase = 'matchEnd';
      hooks.onMatchEnd(state.matchWinner);
    }
  }

  function nextRound() {
    state.round += 1;
    startRound();
  }

  function dropBomb(actor) {
    if (state.bomb.state !== 'carried' || state.bomb.carrier !== actor) return;
    state.bomb.state = 'dropped';
    state.bomb.carrier = null;
    state.bomb.x = actor.body.position.x;
    state.bomb.z = actor.body.position.z;
    // Nearest living Vanguard bot becomes the new carrier.
    let best = null;
    let bestD = Infinity;
    for (const a of aliveOf('vanguard')) {
      if (a.isPlayer) continue;
      const d = (a.body.position.x - state.bomb.x) ** 2 + (a.body.position.z - state.bomb.z) ** 2;
      if (d < bestD) {
        bestD = d;
        best = a;
      }
    }
    if (best) {
      best.carrier = true;
      best.mode = 'route';
      best.route = [hooks.nearestWp(best, state.bomb.x, state.bomb.z)];
      best.routeIndex = 0;
    }
  }

  function step(dt, ctx) {
    const { world, input } = ctx;
    if (state.phase === 'freeze') {
      state.freezeTimer -= dt;
      if (state.freezeTimer <= 0) {
        state.phase = 'live';
        hooks.onLive();
      }
      return;
    }
    if (state.phase === 'roundEnd') {
      state.timer -= dt;
      if (state.timer <= 0) nextRound();
      return;
    }
    if (state.phase !== 'live' && state.phase !== 'planted') return;

    if (state.phase === 'live') {
      state.timer -= dt;
      if (state.timer <= 0) {
        endRound('sentinel', 'Time expired — the charge was never planted.');
        return;
      }
    }
    if (state.phase === 'planted') {
      state.bombTimer -= dt;
      hooks.onBombTick(state.bombTimer);
      if (state.bombTimer <= 0) {
        state.bomb.state = 'detonated';
        hooks.onDetonate();
        endRound('vanguard', 'The charge detonated at Site ' + state.bomb.site + '.');
        return;
      }
    }

    // Pickups: a Vanguard bot walking over a dropped charge takes it.
    if (state.bomb.state === 'dropped') {
      for (const a of aliveOf('vanguard')) {
        if (a.isPlayer) continue;
        const dx = a.body.position.x - state.bomb.x;
        const dz = a.body.position.z - state.bomb.z;
        if (dx * dx + dz * dz < 2.25) {
          state.bomb.state = 'carried';
          state.bomb.carrier = a;
          a.carrier = true;
          hooks.onPickup(a);
          break;
        }
      }
    }
    // The player walks over a dropped charge too.
    if (state.bomb.state === 'dropped' && state.player.alive) {
      const p = state.player.body.position;
      const dx = p.x - state.bomb.x;
      const dz = p.z - state.bomb.z;
      if (dx * dx + dz * dz < 2.25) {
        state.bomb.state = 'carried';
        state.bomb.carrier = state.player;
        hooks.onPickup(state.player);
      }
    }

    // Planting: carrier standing in a site, holding E (player) or settled (bot).
    const carrier = state.bomb.carrier;
    let planter = null;
    if (state.bomb.state === 'carried' && carrier && carrier.alive) {
      const site = world.siteAt(carrier.body.position.x, carrier.body.position.z);
      if (site) {
        const wantsPlant = carrier.isPlayer ? input.state.keys.has('KeyE') : carrier.mode === 'plant';
        if (wantsPlant) planter = { actor: carrier, site };
      }
    }
    if (planter && (!plantingActor || planter.actor !== plantingActor.actor || planter.site !== plantingActor.site)) {
      plantingActor = planter;
      plantProgress = 0;
    }
    if (planter) {
      plantProgress += dt;
      state.bomb.progress = plantProgress / CONFIG.plantTime;
      if (plantProgress >= CONFIG.plantTime) {
        state.bomb.state = 'planted';
        state.bomb.site = planter.site;
        state.bomb.x = planter.actor.body.position.x;
        state.bomb.z = planter.actor.body.position.z;
        state.bomb.carrier = null;
        state.phase = 'planted';
        state.bombTimer = CONFIG.bombTime;
        hooks.economy.award('vanguard', CONFIG.plantReward);
        hooks.onPlanted(planter.site, planter.actor);
        plantProgress = 0;
        plantingActor = null;
      }
    } else {
      plantProgress = 0;
      plantingActor = null;
      state.bomb.progress = 0;
    }

    // Defusing: a Sentinel standing at the planted charge, holding E (player
    // never defuses — the player is Vanguard) or settled (bot).
    let defuser = null;
    if (state.bomb.state === 'planted') {
      for (const a of aliveOf('sentinel')) {
        const dx = a.body.position.x - state.bomb.x;
        const dz = a.body.position.z - state.bomb.z;
        if (dx * dx + dz * dz < 4 && a.mode === 'defuse') {
          defuser = a;
          break;
        }
      }
    }
    if (defuser && defuser !== defusingActor) {
      defusingActor = defuser;
      defuseProgress = 0;
    }
    if (defuser) {
      defuseProgress += dt;
      state.bomb.progress = defuseProgress / CONFIG.defuseTime;
      if (defuseProgress >= CONFIG.defuseTime) {
        state.bomb.state = 'defused';
        hooks.economy.award('sentinel', CONFIG.defuseReward);
        hooks.onDefused(defuser);
        endRound('sentinel', 'The charge was defused at Site ' + state.bomb.site + '.');
        defuseProgress = 0;
        defusingActor = null;
      }
    } else {
      defuseProgress = 0;
      defusingActor = null;
      if (state.bomb.state !== 'planted') state.bomb.progress = 0;
    }

    // Elimination wins.
    if (aliveOf('vanguard').length === 0) {
      endRound('sentinel', 'Vanguard eliminated.');
    } else if (aliveOf('sentinel').length === 0) {
      endRound('vanguard', 'Sentinel eliminated.');
    }
  }

  return {
    startMatch() {
      state.round = 1;
      state.wins = { vanguard: 0, sentinel: 0 };
      state.lossStreak = { vanguard: 0, sentinel: 0 };
      state.matchWinner = null;
      startRound();
    },
    startRound,
    step,
    endRound,
    dropBomb,
    plantProgress() {
      return plantProgress;
    },
    defuseProgress() {
      return defuseProgress;
    },
    get planting() {
      return plantingActor;
    },
    get defusing() {
      return defusingActor;
    },
    spawns: SPAWNS,
    sites: SITES,
  };
}
