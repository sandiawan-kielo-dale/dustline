// Take DUSTLINE's screenshots in headless Chromium (SwiftShader WebGL).
// Serves game/ on :8080, loads each ?shot= from shots.json, waits for
// window.__shotReady, saves a 1280x720 JPEG. Prints console/page errors.
import { chromium } from 'playwright-core';
import { spawn } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');
const shots = JSON.parse(readFileSync(join(root, 'shots.json'), 'utf8'));

const server = spawn('node', ['serve.ts', '--port', '8091'], { cwd: root, stdio: 'pipe' });
await new Promise((resolve, reject) => {
  server.stdout.on('data', (d) => { if (String(d).includes('8091')) resolve(); });
  server.stderr.on('data', (d) => process.stderr.write(d));
  setTimeout(() => reject(new Error('server did not start')), 10000);
});

const exe = process.env.CHROME_PATH;
const browser = await chromium.launch({
  executablePath: exe,
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--disable-gpu-sandbox', '--no-sandbox'],
});

const errors = [];
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  page.on('console', (m) => { if (m.type() === 'error') errors.push(`console: ${m.text()}`); });
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));

  // Plain load first: the menu must boot without errors.
  await page.goto('http://localhost:8091/', { waitUntil: 'commit', timeout: 60000 });
  await page.waitForTimeout(2500);
  const menuOk = await page.evaluate(() => !!document.querySelector('#game canvas'));
  console.log('menu canvas:', menuOk);

  for (const shot of shots) {
    await page.goto(`http://localhost:8091/${shot.query}`, { waitUntil: 'commit', timeout: 60000 });
    try {
      await page.waitForFunction(() => window.__shotReady === true, null, { timeout: 60000 });
    } catch {
      console.log(`TIMEOUT waiting for __shotReady on ${shot.name}`);
      continue;
    }
    const out = join(root, 'screenshots', shot.name);
    await page.screenshot({ path: out, type: 'jpeg', quality: 82 });
    console.log('saved', shot.name);
  }
} finally {
  await browser.close();
  server.kill();
}

console.log(errors.length ? `ERRORS:\n${errors.join('\n')}` : 'no page errors');
