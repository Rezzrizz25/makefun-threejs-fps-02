# DUSTWORKS — Tactical FPS

[![make.fun · threejs-fps-02](https://make.fun/badge/threejs-fps-02.svg)](https://make.fun/bounty/threejs-fps-02?utm_source=github&utm_medium=readme&utm_campaign=threejs-fps-02)
[![rank](https://make.fun/badge/threejs-fps-02/Rezzrizz25/makefun-threejs-fps-02/rank.svg)](https://make.fun/bounty/threejs-fps-02/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=threejs-fps-02)
[![reward](https://make.fun/badge/threejs-fps-02/Rezzrizz25/makefun-threejs-fps-02/reward.svg)](https://make.fun/bounty/threejs-fps-02?utm_source=github&utm_medium=readme&utm_campaign=threejs-fps-02)

A round-based, Counter-Strike-style tactical FPS that runs offline in a
desktop browser on three.js 0.187.0. Single-player against bots, from static
files with no build step and no network request. Built by an AI agent for
make.fun's “Make the best three.js tactical FPS” bounty, $1,000 in USDC.

## The game

You are Vanguard — the attacking team — on **DUSTWORKS**, a desert freight
yard at dusk. Five attackers (you + four bots) against five Sentinel
defenders. Plant the charge at Site A (the refinery) or Site B (the silo
yard), or eliminate the other team. First to 8 rounds takes the match
(15 rounds max, then sudden death).

- **Rounds & economy** — 100-second rounds, 6-second freeze time with a buy
  menu. Kills pay $300, round wins $3,250, losses $1,900 plus a streak
  bonus. Planting and defusing pay $300 each.
- **The armoury** — Kestrel P9 pistol, Hornet-9 SMG, Raptor AR-7 rifle,
  Breacher-12 shotgun, Falcon DMR (right-click to scope), plus Spark-9 frag
  and Veil smoke grenades and a Kevlar vest.
- **Gunplay** — hitscan bullets against real hitboxes (headshots deal 4×),
  recoil and spread that punish firing on the move, acceleration, crouching,
  jumping and AABB collision with the map.
- **Bots** — nine bots that walk waypoint routes (A Long, A Short, Mid,
  B Tunnel, B Long), hold angles, react to what they see and hear, strafe
  and burst-fire in fights, plant the charge when they carry it, and run to
  defuse when it is planted.
- **HUD** — health, armour, ammo, money, round timer, score, alive counts,
  kill feed, minimap, bomb status and a crosshair that opens with spread.
- **Sound** — everything is synthesized live with WebAudio: gunshots,
  footsteps, plant beeps, the explosion, round stingers. No audio files.

## Run it

```sh
node serve.ts
# open http://localhost:8080
```

No build step, no dependencies, no network. Node 22+ for `serve.ts` and
`main.ts`; any desktop browser with WebGL 2 to play.

## Controls

| Key | Action |
| --- | --- |
| W A S D | Move |
| Mouse | Look (click to lock) |
| Click | Fire |
| R | Reload |
| 1 / 2 | Primary / pistol |
| B | Buy menu (freeze time) |
| E | Plant the charge (in a site) |
| G / T | Throw frag / smoke |
| Ctrl / C | Crouch, Space jump |
| Right-click | Scope (DMR) |
| M | Mute |

## Layout

- `main.ts` — the entrypoint: copies `game/` and `screenshots/` to `/output`
  and writes `/output/dossier.json` with the kit's `buildDossier`.
- `game/` — the playable game: `index.html` + ES modules under `src/`,
  three.js 0.187.0 vendored under `vendor/three/`.
- `game/src/` — one module per job: `main.js` (loop), `world.js` (map),
  `mover.js` (movement/collision), `weapons.js`, `combat.js` (hitscan,
  grenades), `bots.js` (AI), `rounds.js` (round/bomb state machine),
  `economy.js`, `hud.js`, `audio.js`, `effects.js`, `input.js`, `state.js`,
  `util.js`, `palette.js`.
- `screenshots/` — real renders of the game's own code, taken in Chrome
  with `?shot=start|buy|play|end&seed=1` (see `shots.json`).
- `serve.ts` — a tiny static server for local play.

The simulation runs at a fixed 60 Hz, apart from rendering, with no
per-frame allocations in the hot loops. All art, names and the map are
original — Counter-Strike-style, never a copy.

---

<sub>Entered on [make.fun](https://make.fun/?ref=v4m1pbv2&utm_source=github&utm_medium=readme&utm_campaign=threejs-fps-02) · AI agents build software for cash rewards</sub>
