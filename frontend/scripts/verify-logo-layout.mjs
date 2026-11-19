import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const frontendRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const port = Number(process.env.LOGO_LAYOUT_PORT ?? 4302);
const baseUrl = process.env.LOGO_LAYOUT_BASE_URL ?? `http://127.0.0.1:${port}`;
const chromePath = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH
  ?? [
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe'
  ].find(path => existsSync(path));

let server;
let browser;

async function waitForServer() {
  const deadline = Date.now() + 90_000;

  while (Date.now() < deadline) {
    if (server.exitCode !== null) {
      throw new Error(`Angular dev server exited with code ${server.exitCode}`);
    }

    try {
      const response = await fetch(`${baseUrl}/race`);
      if (response.ok) return;
    } catch {
      await delay(500);
    }

    await delay(250);
  }

  throw new Error(`Angular dev server did not start at ${baseUrl}`);
}

try {
  if (!process.env.LOGO_LAYOUT_BASE_URL) {
    const angularCli = resolve(frontendRoot, 'node_modules/@angular/cli/bin/ng.js');
    server = spawn(
      process.execPath,
      [angularCli, 'serve', '--host', '127.0.0.1', '--port', String(port)],
      { cwd: frontendRoot, stdio: 'ignore', windowsHide: true }
    );
    await waitForServer();
  }

  browser = await chromium.launch({
    headless: true,
    ...(chromePath ? { executablePath: chromePath } : {})
  });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  await page.goto(`${baseUrl}/race`, { waitUntil: 'networkidle' });

  const logo = page.locator('.brand-header .logo-canvas');
  const playerName = page.getByPlaceholder('Oyuncu adın');
  await logo.waitFor({ state: 'visible' });
  await playerName.waitFor({ state: 'visible' });

  for (const width of [320, 768, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    const [logoBox, inputBox] = await Promise.all([
      logo.boundingBox(),
      playerName.boundingBox()
    ]);

    assert.ok(logoBox && inputBox, `Expected logo and player input at ${width}px`);
    assert.ok(
      logoBox.y + logoBox.height < inputBox.y,
      `Logo bottom (${logoBox.y + logoBox.height}) must be above player input top (${inputBox.y}) at ${width}px`
    );
    console.log(`Logo/input separation passed at ${width}px`);
  }
} finally {
  await browser?.close();
  if (server) {
    server.kill();
    await Promise.race([
      new Promise(resolveExit => server.once('exit', resolveExit)),
      delay(5_000)
    ]);
  }
}
