# DUSTLINE — Meridian Depot

[![make.fun · threejs-fps-02](https://make.fun/badge/threejs-fps-02.svg)](https://make.fun/bounty/threejs-fps-02?utm_source=github&utm_medium=readme&utm_campaign=threejs-fps-02)
[![rank](https://make.fun/badge/threejs-fps-02/sandiawan-kielo-dale/dustline/rank.svg)](https://make.fun/bounty/threejs-fps-02/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=threejs-fps-02)
[![reward](https://make.fun/badge/threejs-fps-02/sandiawan-kielo-dale/dustline/reward.svg)](https://make.fun/bounty/threejs-fps-02?utm_source=github&utm_medium=readme&utm_campaign=threejs-fps-02)

[Entry for the make.fun bounty — Make the best three.js tactical FPS](https://make.fun/bounty/threejs-fps-02) · Referral: https://make.fun/r/y5hkb35z

A round-based tactical first-person shooter in the style Counter-Strike made
famous, built on three.js 0.187.0 for make.fun's
**"Make the best three.js tactical FPS"** bounty
($1,000 · 10 places · ends Tue 17 Nov 2026 04:30 WIB / Mon 16 Nov 21:30 UTC).

You are **Vanguard**. Four bot teammates fight beside you against five
**Jackal** bots across Meridian Depot, a freight yard at dusk. Plant the spike
at Site A (warehouse) or Site B (yard) — or wipe the Jackals out. First to 5
rounds takes the match (max 9 rounds).

## What is in the game

- **Two teams, rounds, an objective.** 100-second rounds: elimination, spike
  detonation (40 s fuse), defuse, or time expiry. Freeze/buy phase before
  every round; round and match banners; spectate after death.
- **Money and a buy menu (B).** $800 start, $300 a kill, $3,250 a round win,
  loss bonus $1,900+ (grows with the losing streak). Five weapons, Kevlar,
  three grenades.
- **Five original weapons.** P9 Sidearm, VK-9 Ripper SMG, AR-77 Longshot
  rifle, LANCE-50 sniper (right-click to scope), M590 Breacher shotgun —
  each with its own damage, fire rate, spread, recoil and viewmodel.
- **Three grenades.** Frag (area damage), Flashbang (blinds bots and the
  player), Smoke (a 12 s cloud that blocks bot line-of-sight too).
- **Bots that play tactically.** Waypoint navigation (BFS over the map graph),
  line-of-sight + field-of-view perception, hearing (gunshots draw them in),
  strafing, burst fire with real raycasts, site holds, plant/defuse
  behaviour, and reactions to what they see and hear.
- **A real map.** Meridian Depot: warehouse Site A, yard Site B, a mid
  building with a raised platform, long corridors on both flanks, crates,
  barrels and containers for cover. Procedural textures, dusk lighting,
  floodlights, floating site markers.
- **Full HUD.** Health/armour, ammo, round timer, team score, credits,
  kill feed, hitmarkers, damage flash, plant/defuse progress, and a live
  minimap (enemies appear only once your team has seen them).
- **Synthesised sound.** Every effect is WebAudio — no audio files, no
  network. The game runs entirely offline from static files.

## Controls

| Key | Action |
| --- | --- |
| W A S D | Move |
| Mouse | Look (pointer lock) |
| Click | Fire / throw grenade |
| Right mouse | Aim (scope on the LANCE-50) |
| R | Reload |
| 1 / 2 | Primary / sidearm |
| 4 / 5 / 6 | Frag / flash / smoke |
| E (hold) | Plant the spike in a site |
| B | Buy menu (buy phase) |
| Shift | Walk — steadier aim |
| Space / Ctrl | Jump / crouch |

## Run it

```sh
node serve.ts            # serves game/ at http://localhost:8080
```

Open http://localhost:8080 in desktop Chrome (or any browser with WebGL 2).
No build step, no network requests. Node 22.18+ is enough; tested on Node 24.

## Screenshots

`?shot=start|buy|play|end&seed=7` stages a deterministic capture and sets
`window.__shotReady` when the frame is frozen. The four shots in
`screenshots/` were taken this way in headless Chromium (SwiftShader WebGL):

1. `1-start.jpg` — title screen over the depot
2. `2-buy.jpg` — buy phase, AR-77 owned
3. `3-play.jpg` — north-lane firefight; the staged burst really kills Vex
   (headshot, +$300 — the kill feed and the credits agree)
4. `4-end.jpg` — Site A secured, spike detonated, Jackals down

Re-take them with `tools/shots.mjs` (needs `playwright-core` +
a Chromium headless shell; see `tools/`).

## How it is built

- `main.ts` — the entry program (Node 22, stdlib only): copies `game/` and
  `screenshots/` to `/output` and writes `dossier.json` with the kit's
  `vendor/makefun-threejs.ts`. Verified deterministic: two runs write
  byte-identical output.
- `game/` — the playable game as static ES modules; `index.html` opens it
  with a single import map pointing at the kit's three.js 0.187.0 files
  under `game/vendor/three/` (byte for byte from the kit, specifiers
  rewritten as the bounty asks).
- `game/src/` — the source the judge reads (~131 KB, inside the 160 KiB
  dossier cap): `world` (map + waypoints), `bots` (AI), `weapons`
  (guns + viewmodel), `match` (rounds, economy, spike, grenades),
  `hud` (DOM HUD + minimap), `effects`, `audio`, `player`, `input`,
  `textures`, `palette`, `utils`, `main` (loop + shot staging).

## Verification (2026-11-16)

- Headless-Chromium play-test: the staged `?shot=play` burst lands a real
  headshot kill on a bot (kill feed, +$300, ammo 18→13 all agree).
- `main.ts` run twice → byte-identical `/output`.
- Gate limits: game/ 17 files / 2.26 MB (max 993 / 48 MiB); screenshots
  4 × ≤ 69 KB (max 4 × 256 KiB, 1280×720); dossier 425 KB (max 1.5 MiB);
  source text 131,219 bytes (cap 163,840 — nothing cut).
- No page errors on any capture or on the plain menu load.

## Credits

Original work for this bounty. Map, names, art and sounds are original —
nothing copies an existing commercial game. three.js is MIT-licensed (see
`game/vendor/three/LICENSE`); this entry is MIT-licensed (`LICENSE`).
