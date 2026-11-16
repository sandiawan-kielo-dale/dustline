// Play-test probe: load ?shot=play, wait for __shotReady, and report the
// kill feed, the enemy's health, and any page errors. Verifies the staged
// firefight really lands a kill.
import { chromium } from 'playwright-core';
import { spawn } from 'node:child_process';

const server = spawn('node', ['serve.ts', '--port', '8093'], { cwd: '/home/hatch/workspace/makefun/fps-threejs', stdio: 'pipe' });
await new Promise((resolve, reject) => {
  server.stdout.on('data', (d) => { if (String(d).includes('8093')) resolve(); });
  setTimeout(() => reject(new Error('server did not start')), 10000);
});

const browser = await chromium.launch({
  executablePath: process.env.CHROME_PATH,
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox'],
});
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const errors = [];
page.on('pageerror', (e) => errors.push(String(e).slice(0, 200)));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text().slice(0, 200)); });

await page.goto('http://localhost:8093/?shot=play&seed=7', { waitUntil: 'load', timeout: 60000 });
await page.waitForFunction(() => window.__shotReady === true, null, { timeout: 30000 });
const report = await page.evaluate(() => {
  const d = window.__dustline;
  return {
    killfeed: [...document.querySelectorAll('#killfeed .kill')].map((el) => el.textContent),
    jackals: d.bots.bots.filter((b) => b.team === 'jackal').map((b) => ({ name: b.name, hp: b.health, alive: b.alive, pos: b.pos.toArray() })),
    playerKills: d.player.kills,
    ammo: `${d.weapon.mag}/${d.weapon.reserve}`,
    lastShot: window.__lastShot,
    blocker: window.__raycastDebug(window.__lastShot.from, window.__lastShot.dir),
    playerPos: d.bots.bots.length ? undefined : undefined,
  };
});
console.log(JSON.stringify(report, null, 2));
console.log(errors.length ? `ERRORS: ${errors.join(' | ')}` : 'no page errors');
await browser.close();
server.kill();
