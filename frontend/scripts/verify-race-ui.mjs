import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const frontendRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const port = Number(process.env.RACE_UI_PORT ?? 4302);
const baseUrl = process.env.RACE_UI_BASE_URL ?? `http://127.0.0.1:${port}`;
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
  if (!process.env.RACE_UI_BASE_URL) {
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

  const cards = page.locator('[role="radiogroup"] [role="radio"]');
  assert.equal(await cards.count(), 4, 'Expected four difficulty radio cards');
  assert.equal(
    await page.locator('[role="radio"][aria-checked="true"]').count(),
    1,
    'Exactly one difficulty must be selected'
  );

  await page.setViewportSize({ width: 320, height: 900 });
  const mobileBoxes = await cards.evaluateAll(elements =>
    elements.map(element => element.getBoundingClientRect().toJSON())
  );
  assert.equal(new Set(mobileBoxes.map(box => box.x)).size, 2, 'Expected two card columns at 320px');
  assert.equal(new Set(mobileBoxes.map(box => box.y)).size, 2, 'Expected two card rows at 320px');

  await page.setViewportSize({ width: 1440, height: 900 });
  const exampleWords = ['kedi', 'çocuk', 'öğretmenlik', 'sürdürülebilir'];
  for (let targetIndex = 0; targetIndex < 4; targetIndex += 1) {
    await page.mouse.move(1438, 898);
    await page.waitForTimeout(600);
    const before = await cards.evaluateAll(elements =>
      elements.map(element => ({
        wrapper: element.getBoundingClientRect().toJSON(),
        face: element.querySelector('.keycap-face').getBoundingClientRect().toJSON()
      }))
    );

    await cards.nth(targetIndex).hover({ position: { x: 16, y: 16 } });
    await page.waitForTimeout(130);
    const after = await cards.evaluateAll(elements =>
      elements.map(element => ({
        wrapper: element.getBoundingClientRect().toJSON(),
        face: element.querySelector('.keycap-face').getBoundingClientRect().toJSON()
      }))
    );

    assert.deepEqual(
      after.map(item => item.wrapper),
      before.map(item => item.wrapper),
      'Hover must not move any card wrapper'
    );
    for (let index = 0; index < 4; index += 1) {
      if (index === targetIndex) {
        assert.notDeepEqual(after[index].face, before[index].face, 'Hovered keycap face should move');
      } else {
        assert.deepEqual(after[index].face, before[index].face, 'A non-hovered keycap face moved');
      }
    }

    const preview = (await cards.nth(targetIndex).locator('.example-word').textContent())?.trim() ?? '';
    assert.ok(preview.length > 0 && preview.length < exampleWords[targetIndex].length);
    await page.mouse.move(1438, 898);
    await page.waitForTimeout(50);
    const restored = (await cards.nth(targetIndex).locator('.example-word').textContent())?.trim();
    assert.equal(restored, exampleWords[targetIndex]);
    console.log(`Difficulty card ${targetIndex + 1} hover isolation passed`);
  }

  const reducedContext = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    reducedMotion: 'reduce'
  });
  const reducedPage = await reducedContext.newPage();
  await reducedPage.goto(`${baseUrl}/race`, { waitUntil: 'networkidle' });
  await reducedPage.locator('.difficulty-card').first().hover();
  const reducedCard = await reducedPage.locator('.difficulty-card').first().evaluate(element => ({
    bouncing: element.querySelector('.difficulty-pip.bouncing') !== null,
    typing: element.querySelector('.example-word.typing') !== null,
    transition: getComputedStyle(element.querySelector('.keycap-face')).transitionDuration,
    word: element.querySelector('.example-word').textContent.trim()
  }));
  assert.deepEqual(reducedCard, {
    bouncing: false,
    typing: false,
    transition: '0s',
    word: 'kedi'
  });
  await reducedContext.close();
  console.log('Reduced-motion behavior passed');
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
