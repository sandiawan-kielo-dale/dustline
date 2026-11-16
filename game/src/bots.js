// Bot teammates and enemies. Each bot is a box-built soldier with a waypoint
// brain: attackers push a site and plant the spike, defenders hold angles and
// converge to defuse. They see (line of sight + field of view), hear (gunshots),
// strafe, burst-fire with real raycasts, plant and defuse.
import * as THREE from 'three';
import { clamp, angleDiff, rayBox, mulberry32 } from './utils.js';
import { WEAPONS } from './weapons.js';
import { PALETTE } from './palette.js';
import { findPath } from './world.js';

const VANGUARD_NAMES = ['Rook', 'Havoc', 'Sable', 'Wren'];
const JACKAL_NAMES = ['Vex', 'Mako', 'Dagger', 'Onyx', 'Fang'];
const BOT_SPEED = 4.3;
const EYE = 1.45;

function buildSoldier(team) {
  const group = new THREE.Group();
  const teamColor = team === 'vanguard' ? PALETTE.vanguard : PALETTE.jackal;
  const cloth = new THREE.MeshStandardMaterial({ color: team === 'vanguard' ? 0x2c3844 : 0x3d2c26, roughness: 0.9 });
  const vest = new THREE.MeshStandardMaterial({ color: teamColor, roughness: 0.7 });
  const dark = new THREE.MeshStandardMaterial({ color: 0x1c1e22, roughness: 0.5, metalness: 0.5 });
  const skin = new THREE.MeshStandardMaterial({ color: 0x8a6a4a, roughness: 0.9 });
  const glow = new THREE.MeshStandardMaterial({ color: 0x111111, emissive: teamColor, emissiveIntensity: 1.6 });

  function box(w, h, d, x, y, z, mat, parent = group) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
    m.position.set(x, y, z);
    m.castShadow = true;
    parent.add(m);
    return m;
  }

  const legL = box(0.16, 0.55, 0.18, -0.11, 0.28, 0, cloth);
  const legR = box(0.16, 0.55, 0.18, 0.11, 0.28, 0, cloth);
  legL.geometry.translate(0, -0.28, 0); legL.position.y = 0.55;
  legR.geometry.translate(0, -0.28, 0); legR.position.y = 0.55;
  box(0.52, 0.62, 0.3, 0, 0.88, 0, cloth);            // torso
  box(0.54, 0.4, 0.32, 0, 0.92, 0, vest);             // vest
  box(0.56, 0.08, 0.34, 0, 1.16, 0, dark);            // belt
  const head = box(0.28, 0.26, 0.28, 0, 1.34, 0, skin);
  box(0.3, 0.1, 0.3, 0, 1.5, 0, vest);                // helmet
  box(0.24, 0.05, 0.02, 0, 1.36, -0.15, glow);        // visor strip
  const armL = box(0.13, 0.5, 0.15, -0.32, 0.95, -0.05, cloth);
  const armR = box(0.13, 0.5, 0.15, 0.32, 0.95, -0.12, cloth);
  armR.rotation.x = -0.9;
  const gun = box(0.06, 0.09, 0.62, 0.18, 1.02, -0.32, dark);
  const muzzle = new THREE.Object3D();
  muzzle.position.set(0.18, 1.04, -0.66);
  group.add(muzzle);
  return { group, legL, legR, armL, armR, gun, head, muzzle };
}

function losClear(ctx, from, to) {
  // World occlusion between two points; smoke blocks sight too.
  const dir = new THREE.Vector3().subVectors(to, from);
  const dist = dir.length();
  if (dist < 0.01) return true;
  dir.normalize();
  ctx.raycaster.set(from, dir);
  ctx.raycaster.far = dist;
  if (ctx.raycaster.intersectObjects(ctx.shootables, false).length > 0) return false;
  if (ctx.smoke && ctx.smoke.blocks(from, to, ctx.now)) return false;
  return true;
}

export function createBotManager(scene, world, ctx) {
  const bots = [];
  const tmpV = new THREE.Vector3();
  const tmpV2 = new THREE.Vector3();

  function makeBot(id, team, name, weaponId, skill) {
    const parts = buildSoldier(team);
    scene.add(parts.group);
    const bot = {
      id, team, name, weaponId,
      def: WEAPONS[weaponId],
      parts,
      pos: new THREE.Vector3(),
      yaw: 0,
      pitch: 0,
      health: 100,
      armor: 0,
      alive: true,
      speed: BOT_SPEED * (0.92 + ctx.random() * 0.16),
      skill, // 0..1, higher is deadlier
      state: 'advance',
      path: [],
      pathIdx: 0,
      holdPoint: null,
      holdAlt: null,
      holdTimer: 0,
      objective: 'A',
      target: null, // {kind:'player'|'bot', ref, pos:Vector3, eye:number, height:number}
      lastSeen: null, // {x, z, time}
      lastSeenPos: new THREE.Vector3(),
      reactionAt: 0,
      nextShot: 0,
      burstLeft: 0,
      burstPauseUntil: 0,
      reloadUntil: 0,
      mag: WEAPONS[weaponId].mag,
      perceiveAt: 0,
      hearAt: 0,
      hearPos: new THREE.Vector3(),
      plantProgress: 0,
      defuseProgress: 0,
      blindUntil: 0,
      walkPhase: Math.random() * 6,
      strafeDir: 1,
      strafeUntil: 0,
      deathAt: 0,
      fallT: 0,
      kills: 0,
      isCarrier: false,
    };
    bots.push(bot);
    return bot;
  }

  function spawnAll(roundSeed) {
    // Remove old groups.
    for (const bot of bots) scene.remove(bot.parts.group);
    bots.length = 0;
    const random = mulberry32(roundSeed);
    const vanguardWeapons = ['ar77', 'vk9', 'ar77', 'm590'];
    const jackalWeapons = ['ar77', 'vk9', 'lance', 'ar77', 'vk9'];
    VANGUARD_NAMES.forEach((name, i) => {
      const bot = makeBot(i, 'vanguard', name, vanguardWeapons[i], 0.45 + random() * 0.2);
      const [x, z, yaw] = world.spawns.vanguard[i];
      bot.pos.set(x, 0, z);
      bot.yaw = yaw;
      bot.objective = i < 2 ? 'A' : i < 3 ? 'B' : 'mid';
    });
    JACKAL_NAMES.forEach((name, i) => {
      const bot = makeBot(10 + i, 'jackal', name, jackalWeapons[i], 0.5 + random() * 0.25);
      const [x, z, yaw] = world.spawns.jackal[i];
      bot.pos.set(x, 0, z);
      bot.yaw = yaw;
      // Defenders: two hold A, two hold B, one roams mid.
      bot.objective = i < 2 ? 'A' : i < 4 ? 'B' : 'mid';
      const site = world.sites[bot.objective === 'mid' ? 'A' : bot.objective];
      const cx = bot.objective === 'mid' ? 0 : site.center[0];
      const cz = bot.objective === 'mid' ? -2 : site.center[1];
      bot.holdPoint = { x: cx + (random() - 0.5) * 5, z: cz + (random() - 0.5) * 5 };
      bot.holdAlt = { x: cx + (random() - 0.5) * 8, z: cz + (random() - 0.5) * 8 };
    });
    // The first Vanguard bot carries the spike.
    bots[0].isCarrier = true;
  }

  function eyePos(bot, out) {
    return out.set(bot.pos.x, bot.pos.y + EYE, bot.pos.z);
  }

  function aabbOf(bot) {
    // [bodyMin, bodyMax, headMin, headMax]
    const h = 1.72;
    return {
      bodyMin: new THREE.Vector3(bot.pos.x - 0.32, bot.pos.y, bot.pos.z - 0.32),
      bodyMax: new THREE.Vector3(bot.pos.x + 0.32, bot.pos.y + 1.32, bot.pos.z + 0.32),
      headMin: new THREE.Vector3(bot.pos.x - 0.18, bot.pos.y + 1.32, bot.pos.z - 0.18),
      headMax: new THREE.Vector3(bot.pos.x + 0.18, bot.pos.y + h, bot.pos.z + 0.18),
    };
  }

  function overlapsWorld(x, z) {
    const probe = new THREE.Box3(
      new THREE.Vector3(x - 0.34, 0.05, z - 0.34),
      new THREE.Vector3(x + 0.34, 1.7, z + 0.34),
    );
    for (const c of world.colliders) if (probe.intersectsBox(c)) return true;
    return false;
  }

  function moveToward(bot, tx, tz, dt) {
    const dx = tx - bot.pos.x;
    const dz = tz - bot.pos.z;
    const dist = Math.hypot(dx, dz);
    if (dist < 0.05) return true;
    const step = Math.min(dist, bot.speed * dt);
    const nx = bot.pos.x + (dx / dist) * step;
    const nz = bot.pos.z + (dz / dist) * step;
    if (!overlapsWorld(nx, bot.pos.z)) bot.pos.x = nx;
    if (!overlapsWorld(bot.pos.x, nz)) bot.pos.z = nz;
    const targetYaw = Math.atan2(-(dx / dist), -(dz / dist));
    bot.yaw += angleDiff(bot.yaw, targetYaw) * Math.min(1, dt * 8);
    bot.walkPhase += dt * bot.speed * 2.2;
    return dist < 0.6;
  }

  function perceive(bot, now) {
    // Who can this bot see right now?
    const eye = eyePos(bot, tmpV);
    const enemies = [];
    if (bot.team === 'jackal') {
      const p = ctx.getPlayer();
      if (p.alive) enemies.push({ kind: 'player', ref: p, x: p.pos.x, z: p.pos.z, eyeY: p.pos.y + p.eye, height: p.height, speed: p.speed });
      for (const other of bots) {
        if (other.team === 'vanguard' && other.alive) {
          enemies.push({ kind: 'bot', ref: other, x: other.pos.x, z: other.pos.z, eyeY: other.pos.y + 1.5, height: 1.72, speed: other.speed });
        }
      }
    } else {
      for (const other of bots) {
        if (other.team === 'jackal' && other.alive) {
          enemies.push({ kind: 'bot', ref: other, x: other.pos.x, z: other.pos.z, eyeY: other.pos.y + 1.5, height: 1.72, speed: other.speed });
        }
      }
    }
    let best = null;
    let bestD = Infinity;
    for (const e of enemies) {
      const dx = e.x - bot.pos.x;
      const dz = e.z - bot.pos.z;
      const dist = Math.hypot(dx, dz);
      if (dist > 46) continue;
      // Field of view: 115 degrees, or point-blank.
      const angTo = Math.atan2(-dx, -dz);
      const diff = Math.abs(angleDiff(bot.yaw, angTo));
      if (diff > 1.0 && dist > 7) continue;
      tmpV2.set(e.x, e.eyeY - 0.25, e.z);
      if (!losClear(ctx, eye, tmpV2)) continue;
      if (dist < bestD) { bestD = dist; best = { ...e, dist }; }
    }
    if (best) {
      const isNew = !bot.target || bot.target.ref !== best.ref;
      bot.target = best;
      bot.lastSeenPos.set(best.x, 0, best.z);
      bot.lastSeen = now;
      if (isNew) bot.reactionAt = now + 0.3 + (1 - bot.skill) * 0.45 + ctx.random() * 0.15;
    } else if (bot.target && now - (bot.lastSeen ?? 0) > 1.6) {
      bot.target = null;
    }
  }

  function fireAt(bot, now) {
    const target = bot.target;
    if (!target) return;
    const def = bot.def;
    if (now < bot.nextShot) return;
    if (now < bot.reloadUntil) return;
    if (bot.burstLeft <= 0) {
      if (now < bot.burstPauseUntil) return;
      bot.burstLeft = 3 + Math.floor(ctx.random() * 3);
      bot.burstPauseUntil = now + 0.55 + ctx.random() * 0.6;
    }
    bot.burstLeft -= 1;
    bot.nextShot = now + 60 / def.rpm;
    bot.mag -= 1;
    if (bot.mag <= 0) {
      bot.mag = def.mag;
      bot.reloadUntil = now + def.reloadTime;
    }

    const muzzle = bot.parts.muzzle.getWorldPosition(new THREE.Vector3());
    // Aim with error: worse with distance, target speed, own movement, burst heat.
    const dist = target.dist;
    const sigma = (0.012 + dist * 0.0011 + (target.speed > 2 ? 0.008 : 0) + (5 - bot.burstLeft) * 0.0012) * (1.35 - bot.skill);
    const aimPoint = new THREE.Vector3(target.x, target.eyeY - 0.15 + (Math.random() - 0.5) * 0.3, target.z);
    const dir = aimPoint.sub(muzzle).normalize();
    dir.x += (ctx.random() * 2 - 1) * sigma;
    dir.y += (ctx.random() * 2 - 1) * sigma;
    dir.z += (ctx.random() - 0.5) * sigma * 2;
    dir.normalize();

    ctx.tracers.fire(muzzle, muzzle.clone().addScaledVector(dir, 40), now);
    ctx.audio.shot(def.sound, dist);
    ctx.muzzleFlash(muzzle);

    // World occlusion first.
    ctx.raycaster.set(muzzle, dir);
    ctx.raycaster.far = 90;
    const worldHit = ctx.raycaster.intersectObjects(ctx.shootables, false)[0];
    const worldDist = worldHit ? worldHit.distance : Infinity;

    // Then the target's body.
    let hitDist = Infinity;
    let isHead = false;
    if (target.kind === 'player') {
      const p = target.ref;
      const h = p.height;
      const bodyMin = new THREE.Vector3(p.pos.x - 0.34, p.pos.y, p.pos.z - 0.34);
      const bodyMax = new THREE.Vector3(p.pos.x + 0.34, p.pos.y + h - 0.35, p.pos.z + 0.34);
      const headMin = new THREE.Vector3(p.pos.x - 0.18, p.pos.y + h - 0.35, p.pos.z - 0.18);
      const headMax = new THREE.Vector3(p.pos.x + 0.18, p.pos.y + h, p.pos.z + 0.18);
      const dHead = rayBox(muzzle, dir, headMin, headMax);
      const dBody = rayBox(muzzle, dir, bodyMin, bodyMax);
      if (dHead >= 0 && dHead < hitDist) { hitDist = dHead; isHead = true; }
      if (dBody >= 0 && dBody < hitDist) { hitDist = dBody; isHead = false; }
    } else {
      const boxes = aabbOf(target.ref);
      const dHead = rayBox(muzzle, dir, boxes.headMin, boxes.headMax);
      const dBody = rayBox(muzzle, dir, boxes.bodyMin, boxes.bodyMax);
      if (dHead >= 0 && dHead < hitDist) { hitDist = dHead; isHead = true; }
      if (dBody >= 0 && dBody < hitDist) { hitDist = dBody; isHead = false; }
    }

    if (hitDist < worldDist && hitDist < def.range) {
      const falloff = clamp(1 - (hitDist / def.range) * 0.35, 0.5, 1);
      const dmg = Math.round(def.damage * (isHead ? def.headMult : 1) * falloff);
      if (target.kind === 'player') ctx.damagePlayer(dmg, bot, isHead);
      else ctx.damageBot(target.ref, dmg, isHead, bot);
    } else if (worldHit) {
      ctx.particles.sparks(worldHit.point, worldHit.face?.normal ?? new THREE.Vector3(0, 1, 0), 6);
    }
  }

  function updateBot(bot, dt, now) {
    const { parts } = bot;
    if (!bot.alive) {
      // Fall over, then fade out of the scene.
      bot.fallT += dt;
      const k = clamp(bot.fallT / 0.35, 0, 1);
      parts.group.rotation.x = -Math.PI / 2 * k;
      parts.group.position.y = 0.15 * k;
      if (now - bot.deathAt > 6) parts.group.visible = false;
      return;
    }

    const blind = now < bot.blindUntil;
    if (now >= bot.perceiveAt) {
      bot.perceiveAt = now + 0.12 + bot.id * 0.013;
      if (!blind) perceive(bot, now);
    }
    if (blind) bot.target = null;

    const phase = ctx.phase();
    const planted = ctx.spikePlanted();
    const plantedSite = ctx.plantedSite();

    // --- Decide what to do.
    let goal = null; // {x, z} to walk toward
    let wantPlant = false;
    let wantDefuse = false;

    if (phase === 'freeze') {
      goal = null;
    } else if (bot.team === 'jackal') {
      if (planted && plantedSite) {
        // Converge on the planted spike itself to defuse.
        const spikePos = ctx.spikePos();
        if (bot.target) {
          // fight on the way
        } else {
          goal = { x: spikePos.x + (bot.id % 3 - 1) * 2, z: spikePos.z + (bot.id % 2 ? 2 : -2) };
          const d = Math.hypot(spikePos.x - bot.pos.x, spikePos.z - bot.pos.z);
          if (d < 3) wantDefuse = true;
        }
      } else if (bot.target) {
        goal = null; // hold and fight
      } else if (now - bot.hearAt < 4) {
        goal = { x: bot.hearPos.x, z: bot.hearPos.z };
      } else {
        // Hold the assigned angle, drifting between two nearby points.
        bot.holdTimer -= dt;
        if (bot.holdTimer <= 0) {
          bot.holdTimer = 4 + ctx.random() * 4;
          const tmp = bot.holdPoint;
          bot.holdPoint = bot.holdAlt;
          bot.holdAlt = tmp;
        }
        goal = bot.holdPoint;
      }
    } else {
      // Vanguard: push the objective site.
      if (planted) {
        // Guard the planted spike from a distance.
        const site = world.sites[plantedSite];
        goal = { x: site.center[0] + (bot.id % 3 - 1) * 4, z: site.center[1] + (bot.id % 2 ? 4 : -4) };
        if (bot.target) goal = null;
      } else if (bot.isCarrier) {
        const site = world.sites[bot.objective === 'mid' ? 'A' : bot.objective];
        const d = Math.hypot(site.center[0] - bot.pos.x, site.center[1] - bot.pos.z);
        if (d < 3.2 && !bot.target) wantPlant = true;
        else goal = { x: site.center[0], z: site.center[1] };
      } else if (bot.target) {
        goal = null;
      } else {
        const site = world.sites[bot.objective === 'mid' ? 'A' : bot.objective];
        goal = { x: site.center[0] + (bot.id % 3 - 1) * 3, z: site.center[1] + (bot.id % 2 ? 2 : -2) };
      }
    }

    // --- Plant / defuse progress.
    if (wantPlant) {
      bot.plantProgress += dt;
      if (bot.plantProgress > 0.4 && Math.floor(bot.plantProgress * 2) !== Math.floor((bot.plantProgress - dt) * 2)) ctx.audio.plantBeep(false);
      if (bot.plantProgress >= 3) {
        bot.plantProgress = 0;
        ctx.onEvent('planted', { by: bot, site: bot.objective === 'mid' ? 'A' : bot.objective });
      }
    } else bot.plantProgress = 0;
    if (wantDefuse) {
      bot.defuseProgress += dt;
      if (bot.defuseProgress >= 5) {
        bot.defuseProgress = 0;
        ctx.onEvent('defused', { by: bot });
      }
    } else bot.defuseProgress = 0;

    // --- Move.
    let moving = false;
    if (bot.target && phase === 'live' && !blind) {
      // Strafe around the target while fighting.
      if (now > bot.strafeUntil) {
        bot.strafeUntil = now + 0.7 + ctx.random() * 0.9;
        bot.strafeDir = ctx.random() > 0.5 ? 1 : -1;
      }
      const dx = bot.target.x - bot.pos.x;
      const dz = bot.target.z - bot.pos.z;
      const dist = Math.hypot(dx, dz) || 1;
      const px = -dz / dist * bot.strafeDir;
      const pz = dx / dist * bot.strafeDir;
      const push = dist > 20 ? 0.6 : dist < 6 ? -0.7 : 0;
      const tx = bot.pos.x + px * bot.speed * dt + (dx / dist) * push * bot.speed * dt;
      const tz = bot.pos.z + pz * bot.speed * dt + (dz / dist) * push * bot.speed * dt;
      if (!overlapsWorld(tx, bot.pos.z)) bot.pos.x = tx;
      if (!overlapsWorld(bot.pos.x, tz)) bot.pos.z = tz;
      const targetYaw = Math.atan2(-dx, -dz);
      bot.yaw += angleDiff(bot.yaw, targetYaw) * Math.min(1, dt * 10);
      bot.walkPhase += dt * bot.speed * 2;
      moving = true;
    } else if (goal) {
      // Follow the waypoint path to the goal.
      if (!bot.path.length || bot.pathIdx >= bot.path.length) {
        bot.path = findPath(world, bot.pos, goal);
        bot.pathIdx = 0;
      }
      const node = world.waypoints[bot.path[bot.pathIdx]];
      if (node) {
        const arrived = moveToward(bot, node.x, node.z, dt);
        moving = !arrived;
        if (arrived) bot.pathIdx += 1;
        if (bot.pathIdx >= bot.path.length) {
          // At the goal: clear the path so a new one is computed next time.
          bot.path = [];
        }
      }
    }

    // --- Fight.
    if (bot.target && phase === 'live' && !blind && now >= bot.reactionAt) {
      fireAt(bot, now);
    }

    // --- Animate.
    const swing = moving ? Math.sin(bot.walkPhase) * 0.55 : 0;
    parts.legL.rotation.x = swing;
    parts.legR.rotation.x = -swing;
    parts.armL.rotation.x = moving ? -swing * 0.5 : 0;
    parts.group.position.set(bot.pos.x, bot.pos.y, bot.pos.z);
    parts.group.rotation.y = bot.yaw;
    if (wantPlant || wantDefuse) parts.group.rotation.x = 0.25; // kneel-ish
    else parts.group.rotation.x = 0;
  }

  return {
    bots,
    spawnAll,
    aabbOf,
    update(dt, now) {
      for (const bot of bots) updateBot(bot, dt, now);
    },
    aliveCount(team) {
      return bots.filter((b) => b.team === team && b.alive).length;
    },
    carrier() {
      return bots.find((b) => b.isCarrier && b.alive) ?? null;
    },
    setCarrier(bot) {
      for (const b of bots) b.isCarrier = false;
      if (bot) bot.isCarrier = true;
    },
    hearShot(pos, now) {
      // Gunfire draws nearby bots toward the sound.
      for (const bot of bots) {
        if (!bot.alive) continue;
        const d = Math.hypot(pos.x - bot.pos.x, pos.z - bot.pos.z);
        if (d < 26) {
          bot.hearAt = now;
          bot.hearPos.set(pos.x, 0, pos.z);
        }
      }
    },
    blind(team, center, radius, now, duration) {
      for (const bot of bots) {
        if (!bot.alive || bot.team !== team) continue;
        const d = Math.hypot(center.x - bot.pos.x, center.z - bot.pos.z);
        if (d < radius + 6) bot.blindUntil = Math.max(bot.blindUntil, now + duration);
      }
    },
    reset() {
      for (const bot of bots) scene.remove(bot.parts.group);
      bots.length = 0;
    },
  };
}
