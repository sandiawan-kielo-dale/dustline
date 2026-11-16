// The HUD: health, ammo, timer, score, money, kill feed, banners, the buy menu
// and a live minimap. All DOM — the 3D canvas never carries UI text.
import { WEAPONS, GRENADES, BUY_MENU } from './weapons.js';
import { ARMOR } from './match.js';
import { formatMoney, formatTime, clamp } from './utils.js';

export function createHud(callbacks) {
  const $ = (id) => document.getElementById(id);
  const el = {
    hud: $('hud'),
    crosshair: $('crosshair'),
    hitmarker: $('hitmarker'),
    dmg: $('dmg'),
    flash: $('flash'),
    ammoMag: $('ammo-mag'),
    ammoReserve: $('ammo-reserve'),
    ammoBox: $('ammo'),
    weaponName: $('weapon-name'),
    healthBar: $('health-fill'),
    healthNum: $('health-num'),
    armorBar: $('armor-fill'),
    armorNum: $('armor-num'),
    timer: $('timer'),
    scoreV: $('score-v'),
    scoreJ: $('score-j'),
    roundLabel: $('round-label'),
    money: $('money'),
    killfeed: $('killfeed'),
    banner: $('banner'),
    bannerTitle: $('banner-title'),
    bannerSub: $('banner-sub'),
    progress: $('progress'),
    progressFill: $('progress-fill'),
    progressLabel: $('progress-label'),
    spike: $('spike'),
    spikeText: $('spike-text'),
    overlay: $('overlay'),
    overlayTitle: $('overlay-title'),
    overlayCopy: $('overlay-copy'),
    playBtn: $('play'),
    buyMenu: $('buy-menu'),
    buyGrid: $('buy-grid'),
    buyMoney: $('buy-money'),
    buyClose: $('buy-close'),
    minimap: $('minimap'),
    grenades: $('grenades'),
    hint: $('hint'),
  };

  const mapCtx = el.minimap.getContext('2d');
  let bannerTimer = 0;
  let hitTimer = 0;

  // --- Buy menu, built from the weapon data so prices can never drift.
  function buildBuyMenu() {
    el.buyGrid.innerHTML = '';
    for (const section of BUY_MENU) {
      const h = document.createElement('h3');
      h.textContent = section.section;
      el.buyGrid.appendChild(h);
      for (const id of section.items) {
        const item = id === 'armor' ? ARMOR : WEAPONS[id] ?? GRENADES[id];
        const card = document.createElement('button');
        card.type = 'button';
        card.className = 'buy-card';
        card.dataset.item = id;
        card.innerHTML = `<b>${item.name}</b><span>${item.desc}</span><i>${formatMoney(item.price)}</i>`;
        card.addEventListener('click', () => callbacks.buy(id));
        el.buyGrid.appendChild(card);
      }
    }
  }
  buildBuyMenu();

  el.buyClose.addEventListener('click', () => callbacks.closeBuy());
  el.playBtn.addEventListener('click', () => callbacks.play());

  function refreshBuy(money, loadout) {
    el.buyMoney.textContent = formatMoney(money);
    for (const card of el.buyGrid.querySelectorAll('.buy-card')) {
      const id = card.dataset.item;
      const item = id === 'armor' ? ARMOR : WEAPONS[id] ?? GRENADES[id];
      const owned = id === 'armor'
        ? loadout.armor >= 100
        : WEAPONS[id] ? loadout.primary === id : loadout.grenades[id] >= 2;
      card.classList.toggle('owned', owned);
      card.classList.toggle('poor', !owned && money < item.price);
    }
  }

  return {
    setHealth(hp, armor) {
      el.healthBar.style.width = `${clamp(hp, 0, 100)}%`;
      el.healthNum.textContent = Math.max(0, Math.ceil(hp));
      el.armorBar.style.width = `${clamp(armor, 0, 100)}%`;
      el.armorNum.textContent = Math.ceil(armor);
      el.healthBar.classList.toggle('low', hp <= 30);
    },
    setAmmo(mag, reserve, reloading) {
      el.ammoMag.textContent = mag;
      el.ammoReserve.textContent = `/ ${reserve}`;
      el.ammoBox.classList.toggle('empty', mag === 0);
      el.ammoBox.classList.toggle('reloading', reloading);
      if (reloading) el.weaponName.textContent = 'RELOADING…';
    },
    setWeaponName(name) {
      el.weaponName.textContent = name;
    },
    setMoney(m) {
      el.money.textContent = formatMoney(m);
    },
    setTimer(seconds, phase) {
      el.timer.textContent = phase === 'freeze' ? `BUY ${formatTime(seconds)}` : formatTime(seconds);
      el.timer.classList.toggle('urgent', phase === 'live' && seconds <= 10);
    },
    setScore(v, j, round) {
      el.scoreV.textContent = v;
      el.scoreJ.textContent = j;
      el.roundLabel.textContent = `ROUND ${round}`;
    },
    setSpike(status, timer, site) {
      if (status === 'planted') {
        el.spike.hidden = false;
        el.spikeText.textContent = `SPIKE PLANTED — SITE ${site} — ${formatTime(timer)}`;
        el.spike.classList.add('planted');
      } else if (status === 'carried') {
        el.spike.hidden = false;
        el.spikeText.textContent = 'YOU CARRY THE SPIKE — PLANT AT A OR B (HOLD E)';
        el.spike.classList.remove('planted');
      } else if (status === 'dropped') {
        el.spike.hidden = false;
        el.spikeText.textContent = 'SPIKE DROPPED — PICK IT UP';
        el.spike.classList.remove('planted');
      } else {
        el.spike.hidden = true;
      }
    },
    setGrenades(g) {
      el.grenades.innerHTML = ['frag', 'flash', 'smoke']
        .map((k) => `<span class="${g[k] ? '' : 'zero'}">${GRENADES[k].name.split(' ')[0]} ×${g[k]}</span>`)
        .join('');
    },
    setHint(text) {
      el.hint.textContent = text;
      el.hint.hidden = !text;
    },
    killfeed(killer, victim, killerTeam, headshot) {
      const row = document.createElement('div');
      row.className = 'kill';
      row.innerHTML = `<b class="${killerTeam}">${killer}</b> <span>${headshot ? '◉' : '✕'}</span> <b class="victim">${victim}</b>`;
      el.killfeed.prepend(row);
      while (el.killfeed.children.length > 5) el.killfeed.lastChild.remove();
      setTimeout(() => row.remove(), 6000);
    },
    banner(title, sub, team) {
      el.bannerTitle.textContent = title;
      el.bannerSub.textContent = sub;
      el.banner.className = `show ${team ?? ''}`;
      bannerTimer = 3.2;
    },
    hideBanner() {
      el.banner.className = '';
    },
    tick(dt) {
      if (bannerTimer > 0) {
        bannerTimer -= dt;
        if (bannerTimer <= 0) this.hideBanner();
      }
      if (hitTimer > 0) {
        hitTimer -= dt;
        if (hitTimer <= 0) el.hitmarker.classList.remove('on');
      }
    },
    hitmarker(kill) {
      el.hitmarker.classList.add('on');
      el.hitmarker.classList.toggle('kill', kill);
      hitTimer = kill ? 0.35 : 0.15;
    },
    damageFlash() {
      el.dmg.classList.remove('on');
      void el.dmg.offsetWidth;
      el.dmg.classList.add('on');
    },
    flashWhite(strength) {
      el.flash.style.opacity = String(clamp(strength, 0, 1));
      setTimeout(() => { el.flash.style.opacity = '0'; }, 60);
      setTimeout(() => { el.flash.style.opacity = '0'; }, 900);
    },
    setProgress(frac, label) {
      if (frac == null) {
        el.progress.hidden = true;
        return;
      }
      el.progress.hidden = false;
      el.progressFill.style.width = `${clamp(frac * 100, 0, 100)}%`;
      el.progressLabel.textContent = label;
    },
    setCrosshairSpread(px) {
      el.crosshair.style.setProperty('--gap', `${px}px`);
    },
    showBuy(money, loadout) {
      refreshBuy(money, loadout);
      el.buyMenu.hidden = false;
    },
    hideBuy() {
      el.buyMenu.hidden = true;
    },
    refreshBuy,
    showOverlay(kind, data = {}) {
      el.overlay.hidden = false;
      if (kind === 'start') {
        el.overlayTitle.textContent = 'DUSTLINE';
        el.overlayCopy.textContent = 'Meridian Depot. Five rounds to take the yard. Plant the spike at A or B, or wipe the Jackals out — and spend what you earn, because the next round only gets harder.';
        el.playBtn.textContent = 'DEPLOY — CLICK TO PLAY';
      } else if (kind === 'paused') {
        el.overlayTitle.textContent = 'PAUSED';
        el.overlayCopy.textContent = 'Click to take the mouse back and keep fighting.';
        el.playBtn.textContent = 'RESUME';
      } else if (kind === 'dead') {
        el.overlayTitle.textContent = 'YOU ARE DOWN';
        el.overlayCopy.textContent = 'Spectating your squad until the round ends.';
        el.playBtn.textContent = 'KEEP WATCHING';
      } else if (kind === 'end') {
        el.overlayTitle.textContent = data.title ?? 'MATCH OVER';
        el.overlayCopy.textContent = data.sub ?? '';
        el.playBtn.textContent = 'PLAY AGAIN';
      }
    },
    hideOverlay() {
      el.overlay.hidden = true;
    },
    onPlay(cb) {
      el.playBtn.addEventListener('click', cb);
    },
    // --- Minimap: walls, sites, spike, teammates (always) and enemies (only
    // when your team has seen them recently — no wallhacks).
    drawMinimap(world, player, bots, seenEnemies, spike) {
      const ctx = mapCtx;
      const W = el.minimap.width;
      const H = el.minimap.height;
      const { minX, maxX, minZ, maxZ } = world.bounds;
      const sx = (x) => ((x - minX) / (maxX - minX)) * (W - 10) + 5;
      const sz = (z) => ((z - minZ) / (maxZ - minZ)) * (H - 10) + 5;
      ctx.clearRect(0, 0, W, H);
      ctx.fillStyle = 'rgba(20,22,26,0.85)';
      ctx.fillRect(0, 0, W, H);
      // Sites
      for (const [letter, site] of Object.entries(world.sites)) {
        ctx.fillStyle = letter === 'A' ? 'rgba(53,208,186,0.25)' : 'rgba(255,176,46,0.25)';
        ctx.fillRect(sx(site.minX), sz(site.minZ), sx(site.maxX) - sx(site.minX), sz(site.maxZ) - sz(site.minZ));
        ctx.fillStyle = letter === 'A' ? '#35d0ba' : '#ffb02e';
        ctx.font = 'bold 13px system-ui, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(letter, sx((site.minX + site.maxX) / 2), sz((site.minZ + site.maxZ) / 2) + 5);
      }
      // Spike
      if (spike && (spike.status === 'planted' || spike.status === 'dropped')) {
        ctx.fillStyle = '#ff4d4d';
        ctx.beginPath();
        ctx.arc(sx(spike.pos.x), sz(spike.pos.z), 4, 0, Math.PI * 2);
        ctx.fill();
      }
      // Enemies seen recently
      const now = performance.now() / 1000;
      for (const [id, seen] of seenEnemies) {
        if (now - seen.time > 4) continue;
        ctx.fillStyle = '#ff5a3c';
        ctx.beginPath();
        ctx.arc(sx(seen.x), sz(seen.z), 3.5, 0, Math.PI * 2);
        ctx.fill();
      }
      // Teammates
      for (const bot of bots) {
        if (!bot.alive || bot.team !== 'vanguard') continue;
        ctx.fillStyle = '#3fa7ff';
        ctx.beginPath();
        ctx.arc(sx(bot.pos.x), sz(bot.pos.z), 3.5, 0, Math.PI * 2);
        ctx.fill();
      }
      // Player arrow
      const px = sx(player.position.x);
      const pz = sz(player.position.z);
      ctx.save();
      ctx.translate(px, pz);
      ctx.rotate(Math.atan2(Math.sin(player.yaw), -Math.cos(player.yaw)) + Math.PI);
      ctx.fillStyle = '#e9e6df';
      ctx.beginPath();
      ctx.moveTo(0, -6); ctx.lineTo(4.5, 5); ctx.lineTo(-4.5, 5); ctx.closePath();
      ctx.fill();
      ctx.restore();
    },
  };
}
