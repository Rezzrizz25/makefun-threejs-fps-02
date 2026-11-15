// Headless capture for DUSTWORKS: serves game/, opens each ?shot= URL in
// headless Chromium (SwiftShader WebGL 2), waits for window.__shotReady,
// and saves a 1280x720 JPEG. Also reports console errors and __gameError.
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { readFileSync } from 'node:fs';

const shots = JSON.parse(readFileSync(new URL('./shots.json', import.meta.url), 'utf8'));
const root = new URL('.', import.meta.url).pathname;

const server = spawn('node', ['serve.ts', '--port', '8123'], { cwd: root, stdio: 'pipe' });
await new Promise((resolve) => {
  server.stdout.on('data', () => resolve());
  setTimeout(resolve, 3000);
});

const browser = await chromium.launch({
  args: ['--enable-unsafe-swiftshader', '--use-gl=angle', '--use-angle=swiftshader', '--no-sandbox', '--disable-dev-shm-usage'],
});
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const errors = [];
page.on('console', (msg) => {
  if (msg.type() === 'error') errors.push(`console: ${msg.text()}`);
});
page.on('pageerror', (err) => errors.push(`pageerror: ${err.message}`));

const webgl = await page.evaluate(() => {
  const canvas = document.createElement('canvas');
  const gl = canvas.getContext('webgl2');
  return gl ? gl.getParameter(gl.VERSION) : null;
});
console.log('WebGL2:', webgl);

for (const shot of shots) {
  const url = `http://localhost:8123/${shot.query}`;
  console.log('loading', url);
  await page.goto(url, { waitUntil: 'load', timeout: 30000 });
  try {
    await page.waitForFunction(() => window.__shotReady === true, { timeout: 20000 });
    console.log('ready:', shot.name);
  } catch {
    const err = await page.evaluate(() => window.__gameError || 'no __shotReady, no error recorded');
    console.log('NOT READY:', shot.name, '-', err);
    errors.push(`${shot.name}: ${err}`);
  }
  await page.screenshot({ path: `${root}screenshots/${shot.name}`, type: 'jpeg', quality: 80 });
  console.log('saved', shot.name);
}

// Also load the plain page (menu) once and check for load errors without shot mode.
await page.goto('http://localhost:8123/', { waitUntil: 'load', timeout: 30000 });
await page.waitForTimeout(2500);
const state = await page.evaluate(() => ({
  error: window.__gameError || null,
  hasCanvas: !!document.querySelector('#game canvas'),
  dustworks: !!window.__dustworks,
}));
console.log('plain load:', JSON.stringify(state));
await page.screenshot({ path: '/tmp/plain-menu.jpg', type: 'jpeg', quality: 80 });

await browser.close();
server.kill();
console.log('ERRORS:', errors.length ? errors : 'none');
