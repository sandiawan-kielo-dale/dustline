// The match: rounds, money, the spike, the buy menu and grenades.
// Vanguard (the player's team) attacks and plants; Jackals defend and defuse.
// First to 5 rounds wins the match, at most 9 rounds.
import * as THREE from 'three';
import { WEAPONS, GRENADES } from './weapons.js';
import { clamp } from './utils.js';

const ROUND_TIME = 100;
const FREEZE_TIME = 4;
const PLANT_TIME = 40;
const WIN_ROUNDS = 5;
const MAX_ROUNDS = 9;

export const ARMOR = { id: 'armor', name: 'KEVLAR VEST', price: 650, desc: 'Absorbs half of incoming damage until it breaks.' };

export function createMatch(world, api) {
  const state = {
    phase: 'menu', // menu | freeze | live | roundEnd | matchEnd
    round: 0,
    scoreV: 0,
    scoreJ: 0,
    money: 800,
    lossStreak: 0,
    roundTime: ROUND_TIME,
    freezeTime: FREEZE_TIME,
    banner: null, // {title, sub, team}
    spike: {
      status: 'carried', // carried | dropped | planted | gone
      carrier: 'player', // 'player' | bot | null
      pos: new THREE.Vector3(),
      site: null,
      timer: PLANT_TIME,
      dropAt: 0,
    },
    loadout: {
      primary: null, // weapon id or null
      grenades: { frag: 0, flash: 0, smoke: 0 },
      armor: 0,
    },
    winner: null,
    roundSeed: 1,
  };

  const grenades = []; // live thrown grenades {pos, vel, kind, fuse, owner}

  function siteAt(x, z) {
    for (const [letter, site] of Object.entries(world.sites)) {
      if (x >= site.minX && x <= site.maxX && z >= site.minZ && z <= site.maxZ) return letter;
    }
    return null;
  }

  function startMatch() {
    state.round = 0;
    state.scoreV = 0;
    state.scoreJ = 0;
    state.money = 800;
    state.lossStreak = 0;
    state.winner = null;
    state.loadout = { primary: null, grenades: { frag: 0, flash: 0, smoke: 0 }, armor: 0 };
    state.banner = null;
    startRound();
  }

  function startRound() {
    state.round += 1;
    state.roundSeed = 1000 + state.round * 77;
    state.phase = 'freeze';
    state.freezeTime = FREEZE_TIME;
    state.roundTime = ROUND_TIME;
    state.spike = {
      status: 'carried',
      carrier: 'player',
      pos: new THREE.Vector3(),
      site: null,
      timer: PLANT_TIME,
      dropAt: 0,
    };
    state.banner = null;
    api.onEvent('roundStart', { round: state.round });
  }

  function awardMoney(amount, reason) {
    state.money += amount;
    api.onEvent('money', { amount, reason });
  }

  function addMoney(amount, reason) {
    awardMoney(amount, reason);
  }

  function endRound(winner, reason) {
    if (state.phase !== 'live') return;
    state.phase = 'roundEnd';
    if (winner === 'vanguard') {
      state.scoreV += 1;
      state.lossStreak = 0;
      awardMoney(3250, 'Round win');
      state.banner = { title: 'ROUND WON', sub: reason, team: 'vanguard' };
      api.audio.roundWin();
    } else {
      state.scoreJ += 1;
      state.lossStreak += 1;
      awardMoney(Math.min(1900 + (state.lossStreak - 1) * 500, 3400), 'Round loss bonus');
      state.banner = { title: 'ROUND LOST', sub: reason, team: 'jackal' };
      api.audio.roundLose();
    }
    api.onEvent('roundEnd', { winner, reason, scoreV: state.scoreV, scoreJ: state.scoreJ });
  }

  function finishRound() {
    if (state.scoreV >= WIN_ROUNDS || state.scoreJ >= WIN_ROUNDS || state.round >= MAX_ROUNDS) {
      state.phase = 'matchEnd';
      state.winner = state.scoreV > state.scoreJ ? 'vanguard' : state.scoreJ > state.scoreV ? 'jackal' : 'draw';
      state.banner = {
        title: state.winner === 'vanguard' ? 'MATCH WON' : state.winner === 'jackal' ? 'MATCH LOST' : 'DRAW',
        sub: `Final score ${state.scoreV} — ${state.scoreJ}. Meridian Depot remembers.`,
        team: state.winner,
      };
      api.onEvent('matchEnd', { winner: state.winner });
    } else {
      startRound();
    }
  }

  function buy(itemId) {
    if (state.phase !== 'freeze' && state.phase !== 'menu') return { ok: false, why: 'Buying is only open between rounds.' };
    if (itemId === 'armor') {
      if (state.loadout.armor >= 100) return { ok: false, why: 'Armour already full.' };
      if (state.money < ARMOR.price) return { ok: false, why: 'Not enough money.' };
      state.money -= ARMOR.price;
      state.loadout.armor = 100;
      api.audio.buy();
      api.onEvent('bought', { item: ARMOR.name });
      return { ok: true };
    }
    const weapon = WEAPONS[itemId];
    if (weapon) {
      if (state.loadout.primary === itemId) return { ok: false, why: 'Already owned.' };
      if (state.money < weapon.price) return { ok: false, why: 'Not enough money.' };
      state.money -= weapon.price;
      state.loadout.primary = itemId;
      api.audio.buy();
      api.onEvent('bought', { item: weapon.name });
      return { ok: true };
    }
    const grenade = GRENADES[itemId];
    if (grenade) {
      if (state.loadout.grenades[itemId] >= 2) return { ok: false, why: 'Carrying the maximum of two.' };
      if (state.money < grenade.price) return { ok: false, why: 'Not enough money.' };
      state.money -= grenade.price;
      state.loadout.grenades[itemId] += 1;
      api.audio.buy();
      api.onEvent('bought', { item: grenade.name });
      return { ok: true };
    }
    return { ok: false, why: 'Unknown item.' };
  }

  function plant(site, byPlayer, pos) {
    if (state.phase !== 'live' || state.spike.status !== 'carried') return false;
    state.spike.status = 'planted';
    state.spike.site = site;
    state.spike.timer = PLANT_TIME;
    state.spike.pos.copy(pos ?? api.getPlayerPos());
    if (byPlayer) awardMoney(300, 'Spike planted');
    api.audio.plantBeep(true);
    api.onEvent('planted', { site, byPlayer });
    return true;
  }

  function dropSpike(pos, now) {
    state.spike.status = 'dropped';
    state.spike.carrier = null;
    state.spike.pos.copy(pos);
    state.spike.dropAt = now;
    api.onEvent('spikeDropped', { pos });
  }

  function pickUpSpike(byPlayer, bot) {
    state.spike.status = 'carried';
    state.spike.carrier = byPlayer ? 'player' : bot;
    api.onEvent('spikePicked', { byPlayer, bot });
  }

  function throwGrenade(kind, from, dir, owner) {
    if (state.loadout.grenades[kind] <= 0) return false;
    state.loadout.grenades[kind] -= 1;
    grenades.push({
      pos: from.clone(),
      vel: dir.clone().multiplyScalar(13).add(new THREE.Vector3(0, 3.2, 0)),
      kind,
      fuse: kind === 'frag' ? 1.6 : 1.1,
      owner,
    });
    api.audio.grenadeThrow();
    return true;
  }

  function explodeGrenade(g, now) {
    if (g.kind === 'frag') {
      api.blast.detonate(g.pos, now);
      api.audio.explosion();
      api.particles.explosion(g.pos);
      api.damageRadius(g.pos, 4.5, 90, g.owner);
      api.shake(0.6);
    } else if (g.kind === 'flash') {
      api.flashBang(g.pos, now);
    } else if (g.kind === 'smoke') {
      api.smoke.add(g.pos.x, Math.max(0.8, g.pos.y), g.pos.z, 3.2, 12, now);
      api.particles.smokePuff(g.pos.x, g.pos.y, g.pos.z, 30, 3);
    }
  }

  const probe = new THREE.Box3();
  function updateGrenades(dt, now) {
    for (let i = grenades.length - 1; i >= 0; i -= 1) {
      const g = grenades[i];
      g.fuse -= dt;
      g.vel.y -= 14 * dt;
      const next = g.pos.clone().addScaledVector(g.vel, dt);
      // Cheap bounce: test the next position as a small box.
      probe.min.set(next.x - 0.12, next.y - 0.12, next.z - 0.12);
      probe.max.set(next.x + 0.12, next.y + 0.12, next.z + 0.12);
      let hit = false;
      for (const c of world.colliders) {
        if (probe.intersectsBox(c)) { hit = true; break; }
      }
      if (hit) {
        // Bounce: dampen and reflect the dominant velocity axis.
        if (Math.abs(g.vel.x) > Math.abs(g.vel.z)) g.vel.x *= -0.45;
        else g.vel.z *= -0.45;
        g.vel.y = Math.abs(g.vel.y) * 0.4;
        if (Math.abs(g.vel.y) < 0.8) g.vel.y = 0.8;
      } else {
        g.pos.copy(next);
      }
      if (g.pos.y < 0.12) {
        g.pos.y = 0.12;
        g.vel.y = Math.abs(g.vel.y) * 0.45;
        g.vel.x *= 0.7;
        g.vel.z *= 0.7;
      }
      if (g.fuse <= 0) {
        explodeGrenade(g, now);
        grenades.splice(i, 1);
      }
    }
  }

  let roundEndTimer = 0;
  let beepAcc = 0;

  function update(dt, now) {
    updateGrenades(dt, now);
    if (state.phase === 'freeze') {
      state.freezeTime -= dt;
      if (state.freezeTime <= 0) {
        state.phase = 'live';
        api.audio.roundStart();
        api.onEvent('live', {});
      }
      return;
    }
    if (state.phase === 'live') {
      // Spike drop timeout: a bot takes it if the player leaves it lying around.
      if (state.spike.status === 'dropped' && now - state.spike.dropAt > 10) {
        const bot = api.nearestVanguardBot(state.spike.pos);
        if (bot) {
          pickUpSpike(false, bot);
          api.bots.setCarrier(bot);
        }
      }
      if (state.spike.status === 'planted') {
        state.spike.timer -= dt;
        beepAcc += dt;
        const interval = state.spike.timer < 10 ? 0.5 : 1;
        if (beepAcc >= interval) {
          beepAcc = 0;
          api.audio.plantBeep(state.spike.timer < 10);
        }
        if (state.spike.timer <= 0) {
          api.blast.detonate(state.spike.pos, now);
          api.audio.explosion();
          api.particles.explosion(state.spike.pos);
          api.damageRadius(state.spike.pos, 12, 200, null);
          api.shake(1);
          endRound('vanguard', 'The spike detonated.');
          return;
        }
      } else {
        state.roundTime -= dt;
        if (state.roundTime <= 0) {
          endRound('jackal', 'Time expired — the spike never went down.');
          return;
        }
      }
      // Elimination check.
      const vAlive = api.bots.aliveCount('vanguard') + (api.playerAlive() ? 1 : 0);
      const jAlive = api.bots.aliveCount('jackal');
      if (vAlive <= 0) {
        endRound('jackal', 'Vanguard eliminated.');
        return;
      }
      if (jAlive <= 0) {
        if (state.spike.status === 'planted') {
          // Defenders all dead but the spike is ticking: attackers win only
          // when it blows, so keep the round alive.
        } else {
          endRound('vanguard', 'Jackals eliminated.');
          return;
        }
      }
      return;
    }
    if (state.phase === 'roundEnd') {
      roundEndTimer += dt;
      if (roundEndTimer > 4.5) {
        roundEndTimer = 0;
        finishRound();
      }
    }
  }

  return {
    state,
    siteAt,
    startMatch,
    startRound,
    endRound,
    buy,
    plant,
    addMoney,
    dropSpike,
    pickUpSpike,
    throwGrenade,
    update,
    grenades,
  };
}
