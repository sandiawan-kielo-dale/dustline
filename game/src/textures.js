// Procedural textures, drawn once on canvases — no network, no image files.
// Every texture is seeded so a ?shot= render is identical every time.
import * as THREE from 'three';
import { mulberry32 } from './utils.js';

function canvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return [c, c.getContext('2d')];
}

function speckle(ctx, w, h, random, count, alpha, dark = true) {
  for (let i = 0; i < count; i += 1) {
    const g = dark ? 0 : 255;
    ctx.fillStyle = `rgba(${g},${g},${g},${random() * alpha})`;
    ctx.fillRect(random() * w, random() * h, 1 + random() * 2, 1 + random() * 2);
  }
}

function stains(ctx, w, h, random, count) {
  for (let i = 0; i < count; i += 1) {
    const r = 12 + random() * 46;
    const grad = ctx.createRadialGradient(0, 0, 0, 0, 0, r);
    grad.addColorStop(0, `rgba(20,20,22,${0.05 + random() * 0.12})`);
    grad.addColorStop(1, 'rgba(20,20,22,0)');
    ctx.save();
    ctx.translate(random() * w, random() * h);
    ctx.fillStyle = grad;
    ctx.fillRect(-r, -r, r * 2, r * 2);
    ctx.restore();
  }
}

function makeTexture(w, h, draw, repeatX = 1, repeatY = 1) {
  const [c, ctx] = canvas(w, h);
  draw(ctx, w, h);
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(repeatX, repeatY);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

export function createTextures(seed = 7) {
  const random = mulberry32(seed);

  const floor = makeTexture(256, 256, (ctx, w, h) => {
    ctx.fillStyle = '#43464b';
    ctx.fillRect(0, 0, w, h);
    // large concrete slabs
    ctx.strokeStyle = 'rgba(20,20,22,0.55)';
    ctx.lineWidth = 3;
    for (let i = 0; i <= 2; i += 1) {
      ctx.beginPath(); ctx.moveTo(i * 128, 0); ctx.lineTo(i * 128, h); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(0, i * 128); ctx.lineTo(w, i * 128); ctx.stroke();
    }
    ctx.strokeStyle = 'rgba(255,255,255,0.05)';
    ctx.lineWidth = 1;
    for (let i = 0; i <= 2; i += 1) {
      ctx.beginPath(); ctx.moveTo(i * 128 + 3, 0); ctx.lineTo(i * 128 + 3, h); ctx.stroke();
    }
    speckle(ctx, w, h, random, 2600, 0.16);
    stains(ctx, w, h, random, 10);
    // faded lane paint
    ctx.fillStyle = 'rgba(216,160,32,0.20)';
    ctx.fillRect(0, 120, w, 10);
  });

  const concrete = makeTexture(256, 256, (ctx, w, h) => {
    ctx.fillStyle = '#83868a';
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = 'rgba(0,0,0,0.10)';
    for (let y = 0; y < 4; y += 1) ctx.fillRect(0, y * 64 + 62, w, 2);
    speckle(ctx, w, h, random, 2200, 0.14);
    stains(ctx, w, h, random, 8);
    // grime at the bottom
    const grad = ctx.createLinearGradient(0, h - 60, 0, h);
    grad.addColorStop(0, 'rgba(30,30,32,0)');
    grad.addColorStop(1, 'rgba(30,30,32,0.35)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, h - 60, w, 60);
  });

  const metal = makeTexture(256, 256, (ctx, w, h) => {
    ctx.fillStyle = '#5d636b';
    ctx.fillRect(0, 0, w, h);
    // vertical ribs
    for (let x = 0; x < w; x += 32) {
      ctx.fillStyle = 'rgba(255,255,255,0.07)';
      ctx.fillRect(x, 0, 3, h);
      ctx.fillStyle = 'rgba(0,0,0,0.25)';
      ctx.fillRect(x + 3, 0, 4, h);
    }
    speckle(ctx, w, h, random, 900, 0.12);
    stains(ctx, w, h, random, 5);
  });

  const crateWood = makeTexture(256, 256, (ctx, w, h) => {
    ctx.fillStyle = '#77683f';
    ctx.fillRect(0, 0, w, h);
    for (let y = 0; y < h; y += 42) {
      ctx.fillStyle = `rgba(0,0,0,${0.08 + random() * 0.08})`;
      ctx.fillRect(0, y, w, 3);
      ctx.fillStyle = 'rgba(255,255,255,0.05)';
      ctx.fillRect(0, y + 3, w, 2);
    }
    // frame
    ctx.strokeStyle = 'rgba(30,24,14,0.6)';
    ctx.lineWidth = 10;
    ctx.strokeRect(5, 5, w - 10, h - 10);
    ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(w, h); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(w, 0); ctx.lineTo(0, h); ctx.stroke();
    speckle(ctx, w, h, random, 700, 0.12);
  });

  const crateTeal = makeTexture(256, 256, (ctx, w, h) => {
    ctx.fillStyle = '#3f6165';
    ctx.fillRect(0, 0, w, h);
    for (let x = 0; x < w; x += 32) {
      ctx.fillStyle = 'rgba(255,255,255,0.08)';
      ctx.fillRect(x, 0, 3, h);
      ctx.fillStyle = 'rgba(0,0,0,0.28)';
      ctx.fillRect(x + 3, 0, 5, h);
    }
    ctx.fillStyle = 'rgba(216,160,32,0.85)';
    ctx.font = 'bold 44px system-ui, sans-serif';
    ctx.fillText('07', 18, 60);
    ctx.fillStyle = 'rgba(233,230,223,0.75)';
    ctx.font = 'bold 20px system-ui, sans-serif';
    ctx.fillText('MERIDIAN', 18, 92);
    speckle(ctx, w, h, random, 800, 0.10);
    stains(ctx, w, h, random, 6);
  });

  const hazard = makeTexture(128, 128, (ctx, w, h) => {
    ctx.fillStyle = '#d8a020';
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = '#1c1c1e';
    for (let x = -h; x < w + h; x += 32) {
      ctx.beginPath();
      ctx.moveTo(x, h); ctx.lineTo(x + 16, h); ctx.lineTo(x + 16 + h, 0); ctx.lineTo(x + h, 0);
      ctx.closePath(); ctx.fill();
    }
  });

  // A big letter for the floating site markers.
  function letterSprite(letter, color) {
    const [c, ctx] = canvas(128, 128);
    ctx.clearRect(0, 0, 128, 128);
    ctx.fillStyle = color;
    ctx.beginPath(); ctx.arc(64, 64, 58, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#14161a';
    ctx.font = 'bold 72px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(letter, 64, 68);
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    return tex;
  }

  return {
    floor, concrete, metal, crateWood, crateTeal, hazard,
    letterA: letterSprite('A', '#35d0ba'),
    letterB: letterSprite('B', '#ffb02e'),
  };
}
