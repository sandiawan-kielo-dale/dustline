// Debug probe: load one ?shot= URL and report what the page is doing.
import { chromium } from 'playwright-core';
import { spawn } from 'node:child_process';

const server = spawn('node', ['serve.ts', '--port', '8092'], { cwd: '/home/hatch/workspace/makefun/fps-threejs', stdio: 'pipe' });
await new Promise((resolve, reject) => {
  server.stdout.on('data', (d) => { if (String(d).includes('8092')) resolve(); });
  setTimeout(() => reject(new Error('server did not start')), 10000);
});

const browser = await chromium.launch({
  executablePath: process.env.CHROME_PATH,
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox'],
});
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
await page.addInitScript(() => {
  window.__errors = [];
  window.addEventListener('error', (e) => window.__errors.push(String(e.message)));
  window.__rafCount = 0;
  const raf = window.requestAnimationFrame.bind(window);
  window.requestAnimationFrame = (cb) => raf((t) => { window.__rafCount += 1; cb(t); });
});
page.on('console', (m) => console.log('[console]', m.type(), m.text().slice(0, 300)));
page.on('pageerror', (e) => console.log('[pageerror]', String(e).slice(0, 500)));

await page.goto('http://localhost:8092/?shot=start&seed=7', { waitUntil: 'commit', timeout: 15000 });
console.log('committed, readyState:', await page.evaluate(() => document.readyState));
for (let i = 0; i < 6; i += 1) {
  await page.waitForTimeout(3000);
  const s = await page.evaluate(() => ({
    readyState: document.readyState,
    shotReady: window.__shotReady,
    rafCount: window.__rafCount,
    errors: window.__errors,
    canvas: !!document.querySelector('#game canvas'),
  }));
  console.log(`t+${(i + 1) * 3}s`, JSON.stringify(s));
  if (s.shotReady) break;
}
await browser.close();
server.kill();
