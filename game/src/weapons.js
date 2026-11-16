// Weapons: five original guns, three grenades, and the first-person viewmodel
// (a low-poly gun built from boxes, parented to the camera, with bob, sway,
// recoil and a muzzle flash). Firing cadence, spread and reload live here;
// the raycast that decides a hit lives in main.js.
import * as THREE from 'three';
import { clamp, lerp } from './utils.js';

export const WEAPONS = {
  p9: {
    id: 'p9', name: 'P9 SIDEARM', kind: 'pistol', price: 0, auto: false,
    damage: 34, headMult: 2.5, rpm: 320, mag: 12, reserve: 48, reloadTime: 1.1,
    spread: 0.006, moveSpread: 0.016, range: 60, kick: 0.006, sound: 'pistol', pellets: 1,
    desc: 'Reliable sidearm. Free with every loadout.',
  },
  vk9: {
    id: 'vk9', name: 'VK-9 RIPPER', kind: 'smg', price: 1200, auto: true,
    damage: 26, headMult: 2.2, rpm: 780, mag: 30, reserve: 90, reloadTime: 1.6,
    spread: 0.011, moveSpread: 0.024, range: 55, kick: 0.005, sound: 'smg', pellets: 1,
    desc: 'Bullet hose for close quarters. Huge, hungry magazine.',
  },
  ar77: {
    id: 'ar77', name: 'AR-77 LONGSHOT', kind: 'rifle', price: 2700, auto: true,
    damage: 33, headMult: 2.5, rpm: 600, mag: 25, reserve: 75, reloadTime: 2.0,
    spread: 0.008, moveSpread: 0.02, range: 80, kick: 0.009, sound: 'rifle', pellets: 1,
    desc: 'The workhorse. Accurate, steady, honest.',
  },
  lance: {
    id: 'lance', name: 'LANCE-50', kind: 'sniper', price: 4750, auto: false,
    damage: 95, headMult: 3, rpm: 55, mag: 5, reserve: 15, reloadTime: 2.8,
    spread: 0.0016, moveSpread: 0.05, range: 120, kick: 0.03, sound: 'sniper', pellets: 1,
    desc: 'One shot, one lesson. Right-click to scope.',
  },
  m590: {
    id: 'm590', name: 'M590 BREACHER', kind: 'shotgun', price: 1050, auto: false,
    damage: 12, headMult: 1.6, rpm: 75, mag: 6, reserve: 24, reloadTime: 2.6,
    spread: 0.03, moveSpread: 0.045, range: 28, kick: 0.02, sound: 'shotgun', pellets: 8,
    desc: 'Eight pellets of bad news. Devastating up close.',
  },
};

export const GRENADES = {
  frag: { id: 'frag', name: 'FRAG GRENADE', price: 300, desc: 'Cooks 1.6s, then 90 damage in a 4m radius.' },
  flash: { id: 'flash', name: 'FLASHBANG', price: 200, desc: 'Blinds anyone looking at it for up to 2.5s.' },
  smoke: { id: 'smoke', name: 'SMOKE GRENADE', price: 300, desc: 'A 12s cloud that blocks sight — and bot vision.' },
};

export const BUY_MENU = [
  { section: 'Primary', items: ['vk9', 'ar77', 'm590', 'lance'] },
  { section: 'Gear', items: ['armor'] },
  { section: 'Grenades', items: ['frag', 'flash', 'smoke'] },
];

function flashTexture() {
  const c = document.createElement('canvas');
  c.width = 64;
  c.height = 64;
  const ctx = c.getContext('2d');
  const g = ctx.createRadialGradient(32, 32, 2, 32, 32, 30);
  g.addColorStop(0, 'rgba(255,240,180,1)');
  g.addColorStop(0.4, 'rgba(255,170,60,0.85)');
  g.addColorStop(1, 'rgba(255,120,20,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 64, 64);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

// Build one viewmodel gun from boxes. Returns {group, muzzle}.
function buildGun(def) {
  const group = new THREE.Group();
  const dark = new THREE.MeshStandardMaterial({ color: 0x23262b, roughness: 0.45, metalness: 0.7 });
  const mid = new THREE.MeshStandardMaterial({ color: 0x4a4f55, roughness: 0.5, metalness: 0.6 });
  const accent = new THREE.MeshStandardMaterial({ color: 0xd8a020, roughness: 0.5, metalness: 0.3 });
  const wood = new THREE.MeshStandardMaterial({ color: 0x6b4e2e, roughness: 0.85 });

  function box(w, h, d, x, y, z, mat = dark) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
    m.position.set(x, y, z);
    group.add(m);
    return m;
  }

  if (def.kind === 'pistol') {
    box(0.05, 0.09, 0.24, 0, -0.02, -0.1);
    box(0.045, 0.1, 0.07, 0, -0.09, 0.0, mid);
    box(0.02, 0.02, 0.02, 0, 0.035, -0.2, accent);
  } else if (def.kind === 'smg') {
    box(0.06, 0.09, 0.42, 0, -0.02, -0.16);
    box(0.05, 0.16, 0.05, 0, -0.12, -0.1, mid);
    box(0.04, 0.05, 0.12, 0, -0.06, -0.02, wood);
    box(0.05, 0.06, 0.1, 0, -0.02, -0.34, mid);
    box(0.015, 0.025, 0.02, 0, 0.035, -0.3, accent);
  } else if (def.kind === 'rifle') {
    box(0.06, 0.1, 0.55, 0, -0.02, -0.2);
    box(0.05, 0.05, 0.2, 0, -0.045, -0.42, mid);
    box(0.05, 0.18, 0.06, 0, -0.13, -0.12, mid);
    box(0.05, 0.07, 0.16, 0, -0.055, -0.02, wood);
    box(0.04, 0.04, 0.06, 0, 0.045, -0.18, accent);
    box(0.012, 0.03, 0.012, 0, 0.04, -0.44, accent);
  } else if (def.kind === 'sniper') {
    box(0.06, 0.09, 0.75, 0, -0.02, -0.28);
    box(0.055, 0.05, 0.3, 0, 0.05, -0.2, mid); // scope
    box(0.02, 0.02, 0.02, 0, 0.05, -0.36, accent);
    box(0.05, 0.16, 0.05, 0, -0.12, -0.12, wood);
    box(0.05, 0.06, 0.1, 0, -0.03, -0.62, mid);
  } else {
    // shotgun
    box(0.07, 0.09, 0.5, 0, -0.02, -0.18);
    box(0.05, 0.05, 0.34, 0, -0.045, -0.4, mid);
    box(0.05, 0.07, 0.2, 0, -0.055, -0.04, wood);
    box(0.05, 0.14, 0.05, 0, -0.11, -0.1, wood);
    box(0.015, 0.025, 0.015, 0, 0.035, -0.4, accent);
  }

  const muzzle = new THREE.Object3D();
  const barrelLen = def.kind === 'sniper' ? -0.68 : def.kind === 'rifle' ? -0.5 : def.kind === 'shotgun' ? -0.58 : def.kind === 'smg' ? -0.4 : -0.24;
  muzzle.position.set(0, -0.01, barrelLen);
  group.add(muzzle);
  // Keep the viewmodel compact in the frame: a full-size gun at half a metre
  // would fill a quarter of the screen.
  group.scale.setScalar(0.68);
  return { group, muzzle };
}

export function createWeaponRig(camera) {
  const flashTex = flashTexture();
  const rig = new THREE.Group();
  camera.add(rig);
  rig.position.set(0.24, -0.26, -0.42);

  const flashSprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: flashTex, transparent: true, depthWrite: false, depthTest: false }));
  flashSprite.scale.set(0.35, 0.35, 1);
  flashSprite.visible = false;
  rig.add(flashSprite);
  const flashLight = new THREE.PointLight(0xffc36b, 0, 9, 2);
  rig.add(flashLight);

  let current = null; // {def, group, muzzle}
  const state = {
    weaponId: 'p9',
    mag: WEAPONS.p9.mag,
    reserve: WEAPONS.p9.reserve,
    reloading: false,
    reloadEnd: 0,
    lastShot: -10,
    flashUntil: 0,
    bobPhase: 0,
    recoil: 0,
    swapT: 0,
  };

  function equip(id) {
    if (current) rig.remove(current.group);
    const def = WEAPONS[id];
    current = buildGun(def);
    rig.add(current.group);
    // Keep the flash sprite on top of the gun group.
    rig.add(flashSprite);
    rig.add(flashLight);
    state.weaponId = id;
    state.mag = def.mag;
    state.reserve = def.reserve;
    state.reloading = false;
    state.swapT = 0.18;
  }

  equip('p9');

  return {
    state,
    def() { return WEAPONS[state.weaponId]; },
    equip,
    canFire(now) {
      const def = WEAPONS[state.weaponId];
      return !state.reloading && state.mag > 0 && now - state.lastShot >= 60 / def.rpm;
    },
    // Returns 'shot', 'dry' or 'no'.
    trigger(now) {
      if (state.reloading) return 'no';
      if (state.mag <= 0) return 'dry';
      if (!this.canFire(now)) return 'no';
      state.lastShot = now;
      state.mag -= 1;
      state.recoil = Math.min(1, state.recoil + 0.45);
      state.flashUntil = now + 0.05;
      return 'shot';
    },
    startReload(now) {
      const def = WEAPONS[state.weaponId];
      if (state.reloading || state.mag === def.mag || state.reserve <= 0) return false;
      state.reloading = true;
      state.reloadEnd = now + def.reloadTime;
      return true;
    },
    finishReload() {
      const def = WEAPONS[state.weaponId];
      const need = def.mag - state.mag;
      const take = Math.min(need, state.reserve);
      state.mag += take;
      state.reserve -= take;
      state.reloading = false;
    },
    refill() {
      const def = WEAPONS[state.weaponId];
      state.mag = def.mag;
      state.reserve = def.reserve;
      state.reloading = false;
    },
    spread(moving, aiming, crouched) {
      const def = WEAPONS[state.weaponId];
      let s = def.spread;
      if (moving > 1) s += def.moveSpread * Math.min(1, moving / 5);
      if (aiming) s *= def.kind === 'sniper' ? 0.35 : 0.55;
      if (crouched) s *= 0.75;
      return s;
    },
    muzzleWorld(out) {
      if (!current) return out.set(0, 0, 0);
      return current.muzzle.getWorldPosition(out);
    },
    update(dt, now, moving, aiming) {
      state.bobPhase += dt * (moving > 0.5 ? moving * 1.6 : 0);
      state.recoil = Math.max(0, state.recoil - dt * 5);
      state.swapT = Math.max(0, state.swapT - dt);
      const bobX = Math.sin(state.bobPhase * 2) * 0.008 * Math.min(1, moving / 4);
      const bobY = Math.abs(Math.cos(state.bobPhase * 2)) * 0.01 * Math.min(1, moving / 4);
      const aimPos = aiming
        ? { x: 0, y: -0.148, z: -0.32 }
        : { x: 0.24, y: -0.26, z: -0.42 };
      const swapDrop = state.swapT > 0 ? (state.swapT / 0.18) * 0.25 : 0;
      rig.position.set(
        lerp(rig.position.x, aimPos.x + bobX, Math.min(1, dt * 14)),
        lerp(rig.position.y, aimPos.y + bobY - swapDrop, Math.min(1, dt * 14)),
        lerp(rig.position.z, aimPos.z, Math.min(1, dt * 14)),
      );
      rig.rotation.x = state.recoil * 0.09;
      rig.rotation.z = bobX * 0.4;
      const flashing = now < state.flashUntil;
      flashSprite.visible = flashing;
      if (flashing && current) {
        current.muzzle.getWorldPosition(flashSprite.position);
        rig.worldToLocal(flashSprite.position);
      }
      flashLight.intensity = flashing ? 14 : 0;
      if (flashing && current) {
        current.muzzle.getWorldPosition(flashLight.position);
        rig.worldToLocal(flashLight.position);
      }
      if (state.reloading && now >= state.reloadEnd) this.finishReload();
    },
  };
}
