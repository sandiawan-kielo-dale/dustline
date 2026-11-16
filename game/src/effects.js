// Visual effects: tracers, impact sparks, explosions and smoke clouds.
// All pooled, all plain three.js — no textures loaded from disk.
import * as THREE from 'three';
import { clamp } from './utils.js';

// --- Tracers: thin glowing lines that fade in 90ms.
export function createTracers(scene) {
  const pool = [];
  for (let i = 0; i < 24; i += 1) {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(6), 3));
    const mat = new THREE.LineBasicMaterial({ color: 0xffd27a, transparent: true, opacity: 0 });
    const line = new THREE.Line(geo, mat);
    line.frustumCulled = false;
    scene.add(line);
    pool.push({ line, until: 0 });
  }
  let next = 0;
  return {
    fire(from, to, now) {
      const t = pool[next];
      next = (next + 1) % pool.length;
      const pos = t.line.geometry.attributes.position;
      pos.setXYZ(0, from.x, from.y, from.z);
      pos.setXYZ(1, to.x, to.y, to.z);
      pos.needsUpdate = true;
      t.line.material.opacity = 0.9;
      t.until = now + 0.09;
    },
    update(now) {
      for (const t of pool) {
        if (t.until && now > t.until) {
          t.line.material.opacity = 0;
          t.until = 0;
        }
      }
    },
  };
}

// --- Particles: one Points cloud, slots reused. Used for sparks, dust, smoke.
export function createParticles(scene, count = 420) {
  const positions = new Float32Array(count * 3);
  const colors = new Float32Array(count * 3);
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  const mat = new THREE.PointsMaterial({ size: 0.14, vertexColors: true, transparent: true, opacity: 0.95, depthWrite: false });
  const points = new THREE.Points(geo, mat);
  points.frustumCulled = false;
  scene.add(points);
  const slots = [];
  for (let i = 0; i < count; i += 1) {
    slots.push({ alive: false, x: 0, y: -100, z: 0, vx: 0, vy: 0, vz: 0, life: 0, maxLife: 1, r: 1, g: 1, b: 1, gravity: 0, drag: 0 });
  }
  let cursor = 0;

  function spawn(x, y, z, vx, vy, vz, life, r, g, b, gravity = 6, drag = 1.5) {
    const s = slots[cursor];
    cursor = (cursor + 1) % count;
    s.alive = true;
    s.x = x; s.y = y; s.z = z;
    s.vx = vx; s.vy = vy; s.vz = vz;
    s.life = life; s.maxLife = life;
    s.r = r; s.g = g; s.b = b;
    s.gravity = gravity; s.drag = drag;
  }

  return {
    sparks(point, normal, n = 10) {
      for (let i = 0; i < n; i += 1) {
        spawn(
          point.x, point.y, point.z,
          normal.x * 2 + (Math.random() - 0.5) * 5,
          Math.random() * 3 + 1,
          normal.z * 2 + (Math.random() - 0.5) * 5,
          0.25 + Math.random() * 0.3,
          1, 0.75 + Math.random() * 0.2, 0.3,
        );
      }
    },
    dust(point, n = 8) {
      for (let i = 0; i < n; i += 1) {
        spawn(
          point.x, point.y, point.z,
          (Math.random() - 0.5) * 1.5, Math.random() * 1.2, (Math.random() - 0.5) * 1.5,
          0.5 + Math.random() * 0.5, 0.55, 0.53, 0.5, 0.5, 2,
        );
      }
    },
    smokePuff(x, y, z, n = 26, spread = 1.6) {
      for (let i = 0; i < n; i += 1) {
        spawn(
          x + (Math.random() - 0.5) * spread,
          y + (Math.random() - 0.5) * spread * 0.6,
          z + (Math.random() - 0.5) * spread,
          (Math.random() - 0.5) * 0.7, 0.25 + Math.random() * 0.5, (Math.random() - 0.5) * 0.7,
          3 + Math.random() * 4, 0.62, 0.62, 0.64, -0.2, 0.4,
        );
      }
    },
    explosion(point) {
      for (let i = 0; i < 60; i += 1) {
        const a = Math.random() * Math.PI * 2;
        const e = (Math.random() - 0.2) * Math.PI;
        const sp = 3 + Math.random() * 9;
        spawn(
          point.x, point.y + 0.3, point.z,
          Math.cos(a) * Math.cos(e) * sp, Math.sin(e) * sp + 3, Math.sin(a) * Math.cos(e) * sp,
          0.5 + Math.random() * 0.7,
          1, 0.5 + Math.random() * 0.35, 0.15, 9, 1.2,
        );
      }
      this.smokePuff(point.x, point.y + 0.6, point.z, 30, 2.4);
    },
    update(dt) {
      for (let i = 0; i < count; i += 1) {
        const s = slots[i];
        if (!s.alive) {
          positions[i * 3 + 1] = -100;
          continue;
        }
        s.life -= dt;
        if (s.life <= 0) {
          s.alive = false;
          positions[i * 3 + 1] = -100;
          continue;
        }
        s.vy -= s.gravity * dt;
        const damp = Math.max(0, 1 - s.drag * dt);
        s.vx *= damp; s.vy *= damp; s.vz *= damp;
        s.x += s.vx * dt;
        s.y += s.vy * dt;
        s.z += s.vz * dt;
        if (s.y < 0.02) { s.y = 0.02; s.vy = 0; }
        positions[i * 3] = s.x;
        positions[i * 3 + 1] = s.y;
        positions[i * 3 + 2] = s.z;
        const fade = clamp(s.life / s.maxLife, 0, 1);
        colors[i * 3] = s.r * fade;
        colors[i * 3 + 1] = s.g * fade;
        colors[i * 3 + 2] = s.b * fade;
      }
      geo.attributes.position.needsUpdate = true;
      geo.attributes.color.needsUpdate = true;
    },
  };
}

// --- Smoke clouds: persistent spheres that block bot line-of-sight.
export function createSmokeClouds(scene) {
  const clouds = [];
  const geo = new THREE.SphereGeometry(1, 10, 8);
  const mat = new THREE.MeshStandardMaterial({ color: 0x9a9a98, transparent: true, opacity: 0.42, roughness: 1, depthWrite: false });
  return {
    add(x, y, z, radius, duration, now) {
      const mesh = new THREE.Mesh(geo, mat.clone());
      mesh.position.set(x, y, z);
      mesh.scale.setScalar(radius);
      scene.add(mesh);
      clouds.push({ mesh, x, y, z, radius, until: now + duration });
    },
    // True when the segment a->b passes through any live cloud.
    blocks(a, b, now) {
      for (const c of clouds) {
        if (now > c.until) continue;
        // Closest point on segment to cloud centre.
        const abx = b.x - a.x;
        const aby = b.y - a.y;
        const abz = b.z - a.z;
        const len2 = abx * abx + aby * aby + abz * abz || 1;
        let t = ((c.x - a.x) * abx + (c.y - a.y) * aby + (c.z - a.z) * abz) / len2;
        t = clamp(t, 0, 1);
        const px = a.x + abx * t;
        const py = a.y + aby * t;
        const pz = a.z + abz * t;
        const d2 = (px - c.x) ** 2 + (py - c.y) ** 2 + (pz - c.z) ** 2;
        if (d2 < c.radius * c.radius) return true;
      }
      return false;
    },
    update(now) {
      for (let i = clouds.length - 1; i >= 0; i -= 1) {
        const c = clouds[i];
        if (now > c.until) {
          scene.remove(c.mesh);
          clouds.splice(i, 1);
        } else {
          const grow = 1 + (1 - (c.until - now) / 12) * 0.35;
          c.mesh.scale.setScalar(c.radius * grow);
          c.mesh.material.opacity = 0.42 * clamp((c.until - now) / 3, 0.15, 1);
        }
      }
    },
  };
}

// --- Explosion flash: expanding sphere + light, short-lived.
export function createBlast(scene) {
  const geo = new THREE.SphereGeometry(1, 16, 12);
  const mat = new THREE.MeshBasicMaterial({ color: 0xffb347, transparent: true, opacity: 0, depthWrite: false });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.visible = false;
  scene.add(mesh);
  const light = new THREE.PointLight(0xff9a3c, 0, 30, 1.5);
  scene.add(light);
  let t0 = -10;
  let center = new THREE.Vector3();
  return {
    detonate(point, now) {
      center.copy(point);
      mesh.position.copy(point);
      mesh.position.y = Math.max(0.6, point.y);
      t0 = now;
      mesh.visible = true;
    },
    update(now) {
      const age = now - t0;
      if (age < 0 || age > 0.7) {
        mesh.visible = false;
        light.intensity = 0;
        return;
      }
      const k = age / 0.7;
      mesh.scale.setScalar(0.5 + k * 7);
      mat.opacity = 0.85 * (1 - k);
      light.position.copy(mesh.position);
      light.intensity = 120 * (1 - k);
    },
  };
}
