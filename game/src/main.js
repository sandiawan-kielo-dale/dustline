// DUSTLINE — Meridian Depot. Boot, the one loop, player combat, the spike,
// grenades, buy flow and the deterministic ?shot= captures.
// A first-person tactical shooter: Vanguard (you + 4 bots) plants the spike at
// Site A or B; the Jackals (5 bots) defend it. First to 5 rounds takes the match.
import * as THREE from 'three';
import { PALETTE } from './palette.js';
import { createTextures } from './textures.js';
import { createWorld } from './world.js';
import { createInput } from './input.js';
import { createPlayer } from './player.js';
import { createWeaponRig, WEAPONS, GRENADES } from './weapons.js';
import { createBotManager } from './bots.js';
import { createAudio } from './audio.js';
import { createTracers, createParticles, createSmokeClouds, createBlast } from './effects.js';
import { createMatch } from './match.js';
import { createHud } from './hud.js';
import { mulberry32, clamp, rayBox } from './utils.js';

const FIXED_STEP = 1 / 60;
const params = new URLSearchParams(window.location.search);
const shot = params.get('shot');
const seed = Number.parseInt(params.get('seed') ?? '7', 10) || 7;
const random = mulberry32(seed);

// --- Renderer / scene -------------------------------------------------------
const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
document.getElementById('game').appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(PALETTE.sky);
scene.fog = new THREE.Fog(PALETTE.fog, 20, 58);
const camera = new THREE.PerspectiveCamera(74, window.innerWidth / window.innerHeight, 0.05, 160);
scene.add(camera);

const textures = createTextures(seed);
const world = createWorld(scene, textures);
const audio = createAudio();
if (shot) audio.setMuted(true);
const tracers = createTracers(scene);
const particles = createParticles(scene);
const smoke = createSmokeClouds(scene);
const blast = createBlast(scene);

// Muzzle flash sprites for the bots (a small pool).
const flashPool = [];
{
  const c = document.createElement('canvas');
  c.width = 64; c.height = 64;
  const g = c.getContext('2d');
  const grad = g.createRadialGradient(32, 32, 2, 32, 32, 30);
  grad.addColorStop(0, 'rgba(255,240,180,1)');
  grad.addColorStop(0.4, 'rgba(255,170,60,0.85)');
  grad.addColorStop(1, 'rgba(255,120,20,0)');
  g.fillStyle = grad; g.fillRect(0, 0, 64, 64);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  for (let i = 0; i < 8; i += 1) {
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false }));
    s.scale.set(0.6, 0.6, 1);
    s.visible = false;
    scene.add(s);
    flashPool.push({ sprite: s, until: 0 });
  }
}
let flashCursor = 0;
function muzzleFlash(pos) {
  const f = flashPool[flashCursor];
  flashCursor = (flashCursor + 1) % flashPool.length;
  f.sprite.position.copy(pos);
  f.sprite.visible = true;
  f.until = now + 0.06;
}

const raycaster = new THREE.Raycaster();
raycaster.far = 120;

// --- Player state -----------------------------------------------------------
const player = createPlayer(world.colliders);
const weaponRig = createWeaponRig(camera);
const input = createInput(renderer.domElement, onLockChange);
const body = player.state;

const playerState = {
  health: 100,
  armor: 0,
  alive: true,
  kills: 0,
  deaths: 0,
  blindUntil: 0,
  spectate: null,
};
let slot = 'pistol'; // 'primary' | 'pistol' | 'frag' | 'flash' | 'smoke'
let plantProgress = 0;
let shakeT = 0;
let shakeMag = 0;
let elapsed = 0;
let now = 0;
let frozen = false;
let started = false;
let buyOpen = false;
const seenEnemies = new Map(); // bot id -> {x, z, time}

// --- Match ------------------------------------------------------------------
const api = {
  onEvent,
  audio,
  particles,
  smoke,
  blast,
  bots: null, // filled in once the bot manager exists (circular)
  getPlayerPos: () => body.position,
  playerAlive: () => playerState.alive,
  nearestVanguardBot: (pos) => {
    let best = null;
    let bestD = Infinity;
    for (const b of bots.bots) {
      if (b.team !== 'vanguard' || !b.alive) continue;
      const d = (b.pos.x - pos.x) ** 2 + (b.pos.z - pos.z) ** 2;
      if (d < bestD) { bestD = d; best = b; }
    }
    return best;
  },
  damageRadius,
  flashBang,
  shake: (m) => { shakeT = 0.45; shakeMag = m; },
};
const match = createMatch(world, api);
const botCtx = {
  random,
  raycaster,
  shootables: world.shootables,
  smoke,
  tracers,
  particles,
  audio,
  now: 0,
  getPlayer: () => ({
    pos: body.position,
    eye: body.eye,
    height: body.height,
    speed: player.groundSpeed(),
    alive: playerState.alive,
  }),
  damagePlayer,
  damageBot,
  phase: () => match.state.phase,
  spikePlanted: () => match.state.spike.status === 'planted',
  plantedSite: () => match.state.spike.site,
  spikePos: () => match.state.spike.pos,
  onEvent,
  muzzleFlash,
};
const bots = createBotManager(scene, world, botCtx);
api.bots = bots;

const hud = createHud({
  play: onPlayButton,
  buy: onBuy,
  closeBuy: () => closeBuy(true),
});

function onEvent(type, data) {
  if (type === 'roundStart') {
    respawnPlayer();
    bots.spawnAll(match.state.roundSeed);
    equipLoadout();
    hud.setScore(match.state.scoreV, match.state.scoreJ, match.state.round);
    hud.setMoney(match.state.money);
    hud.setHealth(playerState.health, playerState.armor);
    hud.setGrenades(match.state.loadout.grenades);
    hud.setSpike(match.state.spike.status, 0, null);
    hud.hideBanner();
    openBuy();
  } else if (type === 'live') {
    closeBuy(false);
    hud.setHint('');
  } else if (type === 'roundEnd') {
    hud.banner(data.winner === 'vanguard' ? 'ROUND WON' : 'ROUND LOST', data.reason, data.winner);
    hud.setScore(match.state.scoreV, match.state.scoreJ, match.state.round);
    hud.setMoney(match.state.money);
    closeBuy(false);
  } else if (type === 'matchEnd') {
    hud.showOverlay('end', { title: match.state.banner.title, sub: match.state.banner.sub });
    if (document.pointerLockElement) document.exitPointerLock();
  } else if (type === 'planted') {
    const site = data.site;
    if (!data.byPlayer && data.by) {
      // A bot planted: move the match state to planted (player plants call
      // match.plant directly, which re-fires this event with byPlayer set).
      match.plant(site, false, data.by.pos);
    }
    hud.banner(`SPIKE PLANTED — SITE ${site}`, 'Hold the site until it blows. Defenders are coming.', 'vanguard');
    hud.setSpike('planted', match.state.spike.timer, site);
  } else if (type === 'defused') {
    match.state.spike.status = 'gone';
    match.endRound('jackal', 'The spike was defused.');
  } else if (type === 'bought') {
    playerState.armor = match.state.loadout.armor;
    hud.setMoney(match.state.money);
    hud.setGrenades(match.state.loadout.grenades);
    hud.setHealth(playerState.health, match.state.loadout.armor);
    hud.refreshBuy(match.state.money, match.state.loadout);
    equipLoadout();
  } else if (type === 'money') {
    hud.setMoney(match.state.money);
  }
}

function respawnPlayer() {
  const [x, z, yaw] = world.spawns.vanguard[0];
  body.position.set(x, 0, z);
  body.velocity.set(0, 0, 0);
  body.yaw = yaw;
  body.pitch = 0;
  playerState.health = 100;
  playerState.armor = match.state.loadout.armor;
  playerState.alive = true;
  playerState.spectate = null;
  plantProgress = 0;
  slot = match.state.loadout.primary ? 'primary' : 'pistol';
  syncCamera();
}

function equipLoadout() {
  const primary = match.state.loadout.primary;
  if (slot === 'primary' && primary) {
    weaponRig.equip(primary);
  } else if (slot === 'primary' && !primary) {
    slot = 'pistol';
    weaponRig.equip('p9');
  } else if (slot === 'pistol') {
    weaponRig.equip('p9');
  }
  hud.setAmmo(weaponRig.state.mag, weaponRig.state.reserve, false);
  hud.setWeaponName(WEAPONS[weaponRig.state.weaponId].name);
  hud.setGrenades(match.state.loadout.grenades);
}

function onPlayButton() {
  audio.unlock();
  if (match.state.phase === 'menu' || match.state.phase === 'matchEnd') {
    match.startMatch();
    hud.hideOverlay();
    input.requestLock();
    started = true;
  } else if (match.state.phase === 'roundEnd') {
    hud.hideOverlay();
    input.requestLock();
  } else if (!playerState.alive) {
    hud.hideOverlay();
  } else {
    hud.hideOverlay();
    input.requestLock();
  }
}

function onLockChange(locked) {
  if (shot) return;
  if (locked) {
    hud.hideOverlay();
    if (buyOpen) closeBuy(false);
  } else if (match.state.phase === 'live' || match.state.phase === 'freeze') {
    if (!buyOpen && playerState.alive) hud.showOverlay('paused');
    else if (!playerState.alive) hud.showOverlay('dead');
  }
}

function openBuy() {
  if (match.state.phase !== 'freeze') return;
  buyOpen = true;
  hud.showBuy(match.state.money, match.state.loadout);
  if (document.pointerLockElement) document.exitPointerLock();
}

function closeBuy(relock) {
  if (!buyOpen) return;
  buyOpen = false;
  hud.hideBuy();
  if (relock && playerState.alive && (match.state.phase === 'freeze' || match.state.phase === 'live')) {
    input.requestLock();
  }
}

function onBuy(id) {
  if (WEAPONS[id]) slot = 'primary'; // buying a primary equips it at once
  const res = match.buy(id);
  if (!res.ok) {
    hud.setHint(res.why);
    audio.denied();
    setTimeout(() => hud.setHint(''), 1800);
  } else {
    hud.setHint('');
  }
}

// --- Combat -----------------------------------------------------------------
const shootDir = new THREE.Vector3();
const shootFrom = new THREE.Vector3();
const hitPoint = new THREE.Vector3();

function damageBot(bot, dmg, isHead, attacker) {
  if (!bot.alive) return;
  bot.health -= dmg;
  if (bot.health <= 0) {
    bot.health = 0;
    bot.alive = false;
    bot.deathAt = now;
    bot.fallT = 0;
    if (attacker === 'player') {
      playerState.kills += 1;
      match.addMoney(300, 'Elimination');
    } else if (attacker && attacker !== 'player') {
      attacker.kills += 1;
    }
    hud.killfeed(attacker === 'player' ? 'You' : attacker.name, bot.name, attacker === 'player' ? 'vanguard' : attacker.team, isHead);
    if (bot.isCarrier && match.state.spike.status === 'carried' && match.state.spike.carrier === bot) {
      match.dropSpike(bot.pos, now);
      bots.setCarrier(null);
    }
  }
}

function damagePlayer(dmg, fromBot, isHead) {
  if (!playerState.alive || match.state.phase !== 'live') return;
  const absorbed = Math.min(playerState.armor, dmg * 0.5);
  playerState.armor -= absorbed;
  playerState.health -= (dmg - absorbed);
  hud.setHealth(playerState.health, playerState.armor);
  hud.damageFlash();
  audio.hurt();
  if (playerState.health <= 0) {
    playerState.health = 0;
    playerState.alive = false;
    playerState.deaths += 1;
    if (fromBot) hud.killfeed(fromBot.name, 'You', 'jackal', isHead);
    if (match.state.spike.status === 'carried' && match.state.spike.carrier === 'player') {
      match.dropSpike(body.position, now);
    }
    hud.showOverlay('dead');
    if (document.pointerLockElement) document.exitPointerLock();
    playerState.spectate = bots.bots.find((b) => b.team === 'vanguard' && b.alive) ?? null;
  }
}

function damageRadius(pos, radius, maxDmg, owner) {
  for (const bot of bots.bots) {
    if (!bot.alive) continue;
    const d = Math.hypot(bot.pos.x - pos.x, bot.pos.y + 1 - pos.y, bot.pos.z - pos.z);
    if (d < radius) {
      const dmg = Math.round(maxDmg * (1 - d / radius));
      damageBot(bot, dmg, false, owner === 'player' ? 'player' : owner);
    }
  }
  if (playerState.alive) {
    const d = Math.hypot(body.position.x - pos.x, body.position.y + 1.2 - pos.y, body.position.z - pos.z);
    if (d < radius) {
      const dmg = Math.round(maxDmg * (1 - d / radius));
      damagePlayer(dmg, null, false);
    }
  }
}

function flashBang(pos, when) {
  // Bots looking at the pop get blinded.
  bots.blind('jackal', pos, 18, when, 2.5);
  bots.blind('vanguard', pos, 18, when, 1.2);
  // The player: only if they can see it and face it.
  if (playerState.alive) {
    player.eyePosition(shootFrom);
    const dir = new THREE.Vector3().subVectors(pos, shootFrom);
    const dist = dir.length();
    dir.normalize();
    camera.getWorldDirection(shootDir);
    const facing = shootDir.dot(dir);
    if (dist < 26 && facing > 0.1) {
      raycaster.set(shootFrom, dir);
      raycaster.far = dist;
      if (raycaster.intersectObjects(world.shootables, false).length === 0) {
        const strength = clamp((1.4 - dist / 26) * facing, 0.15, 1);
        hud.flashWhite(strength);
        playerState.blindUntil = when + strength * 2;
      }
    }
  }
}

function playerShoot() {
  const result = weaponRig.trigger(now);
  if (result === 'dry') {
    audio.dryFire();
    return;
  }
  if (result !== 'shot') return;
  const def = weaponRig.def();
  camera.getWorldDirection(shootDir);
  player.eyePosition(shootFrom);
  const spread = weaponRig.spread(player.groundSpeed(), input.state.aiming, body.crouching);
  audio.shot(def.sound);
  bots.hearShot(shootFrom, now);
  player.recoil(def.kick + random() * 0.003, (random() * 2 - 1) * 0.004);

  for (let p = 0; p < def.pellets; p += 1) {
    const dir = shootDir.clone();
    dir.x += (random() * 2 - 1) * spread;
    dir.y += (random() * 2 - 1) * spread;
    dir.z += (random() * 2 - 1) * spread;
    dir.normalize();
    raycaster.set(shootFrom, dir);
    raycaster.far = def.range;
    const worldHit = raycaster.intersectObjects(world.shootables, false)[0];
    const worldDist = worldHit ? worldHit.distance : Infinity;
    let bestDist = worldDist;
    let bestBot = null;
    let bestHead = false;
    for (const bot of bots.bots) {
      if (!bot.alive || bot.team !== 'jackal') continue;
      const boxes = bots.aabbOf(bot);
      const dHead = rayBox(shootFrom, dir, boxes.headMin, boxes.headMax);
      const dBody = rayBox(shootFrom, dir, boxes.bodyMin, boxes.bodyMax);
      if (dHead >= 0 && dHead < bestDist) { bestDist = dHead; bestBot = bot; bestHead = true; }
      if (dBody >= 0 && dBody < bestDist) { bestDist = dBody; bestBot = bot; bestHead = false; }
    }
    const end = shootFrom.clone().addScaledVector(dir, Math.min(bestDist, def.range));
    weaponRig.muzzleWorld(hitPoint);
    tracers.fire(hitPoint, end, now);
    // Debug record for play-test verification (read by tools/probe-play.mjs).
    window.__lastShot = {
      from: shootFrom.toArray(),
      dir: dir.toArray(),
      worldDist,
      worldHit: worldHit ? { pos: worldHit.object.position.toArray(), point: worldHit.point.toArray(), geo: worldHit.object.geometry.type } : null,
      bestDist,
      bestBot: bestBot ? bestBot.name : null,
      bestHead,
      camPos: camera.position.toArray(),
      camYaw: body.yaw,
      camPitch: body.pitch,
    };
    if (bestBot) {
      const falloff = clamp(1 - (bestDist / def.range) * 0.35, 0.5, 1);
      const dmg = Math.round(def.damage * (bestHead ? def.headMult : 1) * falloff);
      damageBot(bestBot, dmg, bestHead, 'player');
      hud.hitmarker(bestBot.health <= 0);
      audio.hit(bestBot.health <= 0);
      seenEnemies.set(bestBot.id, { x: bestBot.pos.x, z: bestBot.pos.z, time: now });
    } else if (worldHit) {
      particles.sparks(worldHit.point, worldHit.face?.normal ?? new THREE.Vector3(0, 1, 0), 5);
      particles.dust(worldHit.point, 3);
    }
  }
  hud.setAmmo(weaponRig.state.mag, weaponRig.state.reserve, weaponRig.state.reloading);
}

function throwGrenade() {
  const kind = slot;
  if (!GRENADES[kind]) return;
  camera.getWorldDirection(shootDir);
  player.eyePosition(shootFrom);
  if (match.throwGrenade(kind, shootFrom, shootDir, 'player')) {
    hud.setGrenades(match.state.loadout.grenades);
    slot = match.state.loadout.primary ? 'primary' : 'pistol';
    equipLoadout();
  }
}

// --- Per-frame ---------------------------------------------------------------
function syncCamera() {
  if (!playerState.alive && playerState.spectate) {
    const b = playerState.spectate;
    camera.position.set(b.pos.x, b.pos.y + 1.5, b.pos.z);
    camera.rotation.set(0, b.yaw, 0, 'YXZ');
    return;
  }
  camera.position.set(body.position.x, body.position.y + body.eye, body.position.z);
  camera.rotation.set(body.pitch, body.yaw, 0, 'YXZ');
  if (shakeT > 0) {
    camera.position.x += (Math.random() - 0.5) * 0.12 * shakeMag;
    camera.position.y += (Math.random() - 0.5) * 0.12 * shakeMag;
    camera.rotation.z += (Math.random() - 0.5) * 0.02 * shakeMag;
  }
}

let accumulator = 0;
let lastTime = performance.now();

function step(dt) {
  elapsed += dt;
  now = elapsed;
  botCtx.now = now;
  world.update(dt, elapsed);
  if (match.state.phase === 'menu') return;

  // Track enemies the player can see (for the minimap).
  if (match.state.phase === 'live' && playerState.alive) {
    player.eyePosition(shootFrom);
    for (const bot of bots.bots) {
      if (bot.team !== 'jackal' || !bot.alive) continue;
      const dx = bot.pos.x - shootFrom.x;
      const dz = bot.pos.z - shootFrom.z;
      if (Math.hypot(dx, dz) > 40) continue;
      const target = new THREE.Vector3(bot.pos.x, bot.pos.y + 1.2, bot.pos.z);
      const dir = target.clone().sub(shootFrom).normalize();
      raycaster.set(shootFrom, dir);
      raycaster.far = shootFrom.distanceTo(target);
      if (raycaster.intersectObjects(world.shootables, false).length === 0) {
        seenEnemies.set(bot.id, { x: bot.pos.x, z: bot.pos.z, time: now });
      }
    }
  }

  const phase = match.state.phase;
  if (phase === 'live' || phase === 'freeze') {
    const look = input.takeLook();
    if (playerState.alive && input.state.locked) player.look(look.x, look.y);
    if (playerState.alive) {
      player.step(dt, input.state.keys, input.state.aiming);
      if (input.state.firing && phase === 'live') {
        if (slot === 'primary' || slot === 'pistol') playerShoot();
      }
      // Slot keys and actions.
      for (const code of input.takePressed()) {
        if (code === 'KeyR') weaponRig.startReload(now);
        else if (code === 'Digit1' && match.state.loadout.primary) { slot = 'primary'; equipLoadout(); }
        else if (code === 'Digit2') { slot = 'pistol'; equipLoadout(); }
        else if (code === 'Digit4' && match.state.loadout.grenades.frag > 0) slot = 'frag';
        else if (code === 'Digit5' && match.state.loadout.grenades.flash > 0) slot = 'flash';
        else if (code === 'Digit6' && match.state.loadout.grenades.smoke > 0) slot = 'smoke';
        else if (code === 'KeyB') {
          if (buyOpen) closeBuy(true);
          else openBuy();
        }
      }
      if (input.state.firing && phase === 'live' && GRENADES[slot]) {
        throwGrenade();
        input.state.firing = false;
      }
      // Planting: hold E inside a site while carrying the spike.
      const site = match.siteAt(body.position.x, body.position.z);
      const carrying = match.state.spike.status === 'carried' && match.state.spike.carrier === 'player';
      if (phase === 'live' && carrying && site && input.state.keys.has('KeyE')) {
        plantProgress += dt;
        hud.setProgress(plantProgress / 3, `PLANTING SPIKE — SITE ${site}`);
        if (plantProgress >= 3) {
          plantProgress = 0;
          hud.setProgress(null);
          match.plant(site, true, body.position);
        }
      } else {
        if (plantProgress > 0) hud.setProgress(null);
        plantProgress = 0;
      }
      // Pick up a dropped spike by walking over it.
      if (phase === 'live' && match.state.spike.status === 'dropped') {
        const d = Math.hypot(match.state.spike.pos.x - body.position.x, match.state.spike.pos.z - body.position.z);
        if (d < 1.4) {
          match.pickUpSpike(true, null);
          bots.setCarrier(null);
          hud.setSpike('carried', 0, null);
        }
      }
      // Hint line.
      let hint = '';
      if (phase === 'freeze') hint = 'Buy phase — press B for the buy menu';
      else if (carrying && site) hint = 'Hold E to plant the spike';
      else if (carrying) hint = 'Carry the spike to Site A or B';
      hud.setHint(hint);
    }
    weaponRig.update(dt, now, player.groundSpeed(), input.state.aiming);
    // Sniper scope: narrow the field of view while aiming.
    const def = weaponRig.def();
    const targetFov = input.state.aiming && def.kind === 'sniper' ? 24 : input.state.aiming ? 58 : 74;
    if (Math.abs(camera.fov - targetFov) > 0.5) {
      camera.fov += (targetFov - camera.fov) * Math.min(1, dt * 12);
      camera.updateProjectionMatrix();
    }
  }

  bots.update(dt, now);
  match.update(dt, now);
  tracers.update(now);
  particles.update(dt);
  smoke.update(now);
  blast.update(now);
  for (const f of flashPool) if (f.until && now > f.until) { f.sprite.visible = false; f.until = 0; }
  if (shakeT > 0) shakeT -= dt;

  // HUD refresh.
  hud.setTimer(phase === 'freeze' ? match.state.freezeTime : match.state.roundTime, phase);
  hud.setSpike(match.state.spike.status, match.state.spike.timer, match.state.spike.site);
  hud.tick(dt);
  hud.drawMinimap(world, body, bots.bots, seenEnemies, match.state.spike);
  hud.setCrosshairSpread(4 + weaponRig.spread(player.groundSpeed(), input.state.aiming, body.crouching) * 900);
  if (match.state.phase === 'live' && playerState.alive && weaponRig.state.reloading === false) {
    hud.setAmmo(weaponRig.state.mag, weaponRig.state.reserve, false);
  }
  syncCamera();
}

function frame(t) {
  requestAnimationFrame(frame);
  const dt = Math.min((t - lastTime) / 1000, 0.1);
  lastTime = t;
  if (!frozen) {
    accumulator += dt;
    let steps = 0;
    while (accumulator >= FIXED_STEP && steps < 5) {
      step(FIXED_STEP);
      accumulator -= FIXED_STEP;
      steps += 1;
    }
    if (accumulator > FIXED_STEP * 5) accumulator = 0;
  }
  renderer.render(scene, camera);
}

// --- Deterministic captures --------------------------------------------------
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

function aimAt(point) {
  const dx = point.x - body.position.x;
  const dy = point.y - (body.position.y + body.eye);
  const dz = point.z - body.position.z;
  const len = Math.hypot(dx, dy, dz) || 1;
  body.yaw = Math.atan2(-dx, -dz);
  body.pitch = Math.asin(clamp(dy / len, -1, 1));
  syncCamera();
}

function runShot(name) {
  hud.hideOverlay();
  hud.hideBuy();
  // The world meshes' matrices are only computed on the first render, but the
  // captures raycast before any render happens — so force one update here,
  // or every ray would test the meshes as if they sat at the origin.
  scene.updateMatrixWorld(true);
  match.startMatch();
  // startMatch opens the buy menu (freeze phase); only the buy capture wants it.
  hud.hideBuy();
  buyOpen = false;
  // Drive the match into a staged state by hand.
  match.state.phase = 'live';
  match.state.roundTime = 47;
  match.state.scoreV = 2;
  match.state.scoreJ = 1;
  match.state.money = 4550;
  match.state.loadout.primary = 'ar77';
  match.state.loadout.grenades = { frag: 1, flash: 1, smoke: 1 };
  match.state.loadout.armor = 60;
  playerState.health = 76;
  playerState.armor = 60;
  bots.spawnAll(777);
  slot = 'primary';
  equipLoadout();
  hud.setScore(2, 1, 3);
  hud.setMoney(4550);
  hud.setHealth(76, 60);
  hud.setGrenades(match.state.loadout.grenades);

  if (name === 'start') {
    match.state.phase = 'freeze';
    match.state.scoreV = 0;
    match.state.scoreJ = 0;
    match.state.round = 1;
    body.position.set(-14, 0, 15.5);
    body.yaw = 0.5;
    body.pitch = -0.02;
    settle(30);
    hud.setScore(0, 0, 1);
    hud.showOverlay('start');
    hud.setAmmo(weaponRig.state.mag, weaponRig.state.reserve, false);
  } else if (name === 'buy') {
    match.state.phase = 'freeze';
    match.state.freezeTime = 12;
    match.state.round = 2;
    body.position.set(-18, 0, 14);
    body.yaw = 0.15;
    settle(20);
    hud.setScore(1, 0, 2);
    buyOpen = true;
    hud.showBuy(match.state.money, match.state.loadout);
  } else if (name === 'play') {
    // North-lane firefight: a clear lane at z=-10, enemy crossing it as the
    // player fires a burst. The kill feed only records a kill that really lands.
    // The staged enemy and teammate hold still (speed 0) so the burst tracks
    // them — the same posing the kit's own starter uses for its captures.
    body.position.set(-10, 0, -10);
    const enemy = bots.bots.find((b) => b.team === 'jackal');
    enemy.pos.set(8, 0, -10);
    enemy.speed = 0;
    enemy.yaw = Math.PI / 2;
    enemy.parts.group.position.copy(enemy.pos);
    enemy.parts.group.rotation.y = enemy.yaw;
    const mate = bots.bots.find((b) => b.team === 'vanguard' && b.id !== 0);
    mate.pos.set(-6, 0, -8);
    mate.speed = 0;
    mate.yaw = -Math.PI / 2;
    mate.parts.group.position.copy(mate.pos);
    mate.parts.group.rotation.y = mate.yaw;
    weaponRig.state.mag = 18;
    weaponRig.state.reserve = 75;
    settle(10);
    input.state.locked = true;
    for (let i = 0; i < 5; i += 1) {
      aimAt(new THREE.Vector3(enemy.pos.x, 1.3, enemy.pos.z));
      playerShoot();
      settle(7);
    }
    hud.setAmmo(weaponRig.state.mag, weaponRig.state.reserve, false);
    hud.setTimer(47, 'live');
  } else if (name === 'end') {
    // Round won at Site A: the spike blew, two Jackals are down, banner up.
    // The player stands in the south door of the warehouse, looking in.
    match.state.phase = 'roundEnd';
    match.state.scoreV = 3;
    match.state.scoreJ = 1;
    match.state.spike.status = 'gone';
    match.state.roundTime = 0;
    body.position.set(-12.5, 0, -15.5);
    aimAt(new THREE.Vector3(-17.5, 1.0, -10.5));
    const dead1 = bots.bots.find((b) => b.team === 'jackal');
    dead1.pos.set(-14.5, 0, -10);
    dead1.alive = false;
    dead1.deathAt = now;
    dead1.fallT = 0.4;
    dead1.parts.group.position.copy(dead1.pos);
    const dead2 = bots.bots.find((b) => b.team === 'jackal' && b !== dead1);
    dead2.pos.set(-17.5, 0, -13.5);
    dead2.alive = false;
    dead2.deathAt = now;
    dead2.fallT = 0.4;
    dead2.parts.group.position.copy(dead2.pos);
    particles.smokePuff(-16, 1, -12, 30, 3);
    settle(30);
    hud.setScore(3, 1, 4);
    hud.banner('SITE A SECURED', 'The spike detonated. Vanguard takes the round.', 'vanguard');
    hud.setSpike('gone', 0, null);
  }
  if (name === 'play' || name === 'end') {
    // The buy menu opens during the freeze phase; play/end captures are live.
    hud.hideBuy();
    buyOpen = false;
  }
  paintTwiceThenReady();
}

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

// --- Boot --------------------------------------------------------------------
// Debug/testing handle (read-only): lets a play-test script inspect the match
// without touching the game. Harmless in normal play.
window.__dustline = {
  match,
  bots,
  get player() { return playerState; },
  get weapon() { return weaponRig.state; },
};
// Identify what a ray from `from` along `dir` hits in the world.
window.__raycastDebug = (from, dir) => {
  const o = new THREE.Vector3(...from);
  const d = new THREE.Vector3(...dir).normalize();
  raycaster.set(o, d);
  raycaster.far = 120;
  return raycaster.intersectObjects(world.shootables, false).slice(0, 3).map((h) => ({
    distance: h.distance,
    point: h.point.toArray(),
    pos: h.object.position.toArray(),
    geo: h.object.geometry.type,
    scale: h.object.scale.toArray(),
  }));
};
syncCamera();
hud.setScore(0, 0, 1);
hud.setMoney(800);
hud.setHealth(100, 0);
hud.setAmmo(12, 48, false);
if (shot) {
  runShot(shot);
} else {
  hud.showOverlay('start');
  // Slow menu pan across the depot until the player deploys.
  let menuT = 0;
  const menuLoop = () => {
    if (started || match.state.phase !== 'menu') return; // stop once play starts
    menuT += 0.016;
    camera.position.set(-16 + Math.sin(menuT * 0.1) * 4, 7, 14 + Math.cos(menuT * 0.07) * 2);
    camera.lookAt(0, 1, -4);
    renderer.render(scene, camera);
    requestAnimationFrame(menuLoop);
  };
  menuLoop();
  requestAnimationFrame(frame);
}
