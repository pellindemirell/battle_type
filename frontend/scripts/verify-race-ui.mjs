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

function inside(box, outer) {
  return box.left >= outer.left - 1 && box.right <= outer.right + 1 &&
    box.top >= outer.top - 1 && box.bottom <= outer.bottom + 1;
}

function assertNoOverlap(boxes, label) {
  for (const [index, first] of boxes.entries()) {
    for (const second of boxes.slice(index + 1)) {
      assert.ok(
        first.right <= second.left + 1 || second.right <= first.left + 1 ||
        first.bottom <= second.top + 1 || second.bottom <= first.top + 1,
        `Two ${label} boxes intersect`
      );
    }
  }
}

function measureSetup(page) {
  return page.evaluate(() => {
    const rect = element => element.getBoundingClientRect().toJSON();
    const profile = document.querySelector('.profile-panel');
    const settings = document.querySelector('.room-options');
    const examplesFit = Array.from(document.querySelectorAll('.example-word')).every(word => {
      const range = document.createRange();
      range.selectNodeContents(word);
      const face = word.closest('.keycap-face').getBoundingClientRect();
      const lines = Array.from(range.getClientRects());
      return lines.length === 1 && lines.every(line =>
        line.left >= face.left - 1 && line.right <= face.right + 1
      );
    });
    return {
      logo: rect(document.querySelector('.brand-header .logo-canvas')),
      profile: rect(profile),
      settings: rect(settings),
      avatars: Array.from(profile.querySelectorAll('.avatar-frame'), rect),
      cards: Array.from(settings.querySelectorAll('.difficulty-card'), rect),
      scrollWidth: document.documentElement.scrollWidth,
      clientWidth: document.documentElement.clientWidth,
      scrollbarWidth: getComputedStyle(document.documentElement, '::-webkit-scrollbar').width,
      examplesFit
    };
  });
}

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

  await page.locator('.setup').evaluate(async panel => {
    await Promise.allSettled(panel.getAnimations().map(animation => animation.finished));
  });
  const renderedFonts = await page.evaluate(async () =>
    await Promise.all(['Space Grotesk', 'Inter', 'JetBrains Mono'].map(async family =>
      (await document.fonts.load(`600 16px "${family}"`, 'Iıİi Ğğ Şş Çç Üü Öö')).length
    ))
  );
  assert.ok(renderedFonts.every(count => count >= 2), 'Each font must load both Turkish subsets');

  for (const width of [320, 375, 768, 1024, 1440, 1920]) {
    await page.setViewportSize({ width, height: 900 });
    const layout = await measureSetup(page);

    assert.equal(layout.scrollWidth, layout.clientWidth, `Horizontal overflow at ${width}px`);
    assert.ok(layout.logo.bottom < layout.profile.top, `Logo overlaps the profile at ${width}px`);
    for (const box of [layout.logo, layout.profile, layout.settings]) {
      assert.ok(
        Math.abs((box.left + box.right) / 2 - layout.clientWidth / 2) <= 1,
        `Content is not centered at ${width}px`
      );
    }
    assert.equal(layout.avatars.length, 12);
    assert.ok(layout.avatars.every(box => inside(box, layout.profile)), 'Avatars must fit the panel');
    assert.ok(layout.cards.every(box => inside(box, layout.settings)), 'Cards must fit the panel');
    assert.ok(layout.examplesFit, `Difficulty examples are clipped at ${width}px`);
    assertNoOverlap(layout.avatars, 'avatar');
    assertNoOverlap(layout.cards, 'difficulty card');
    assert.equal(new Set(layout.cards.map(box => Math.round(box.width))).size, 1);
    assert.equal(new Set(layout.cards.map(box => Math.round(box.height))).size, 1);
    assert.equal(new Set(layout.cards.map(box => box.x)).size, width >= 1024 ? 4 : 2);

    if (width <= 375) {
      assert.equal(layout.scrollbarWidth, '8px');
      const scrollTop = await page.evaluate(() => {
        window.scrollTo(0, document.documentElement.scrollHeight);
        return window.scrollY;
      });
      assert.ok(scrollTop > 0, 'The page must scroll naturally');
      await page.evaluate(() => window.scrollTo(0, 0));
    }
    console.log(`Centered, readable and overflow-free at ${width}px`);
  }

  const nicknameHint = page.locator('#nickname-hint');
  await playerName.fill('A');
  assert.equal(await playerName.getAttribute('aria-invalid'), 'true');
  assert.match(await nicknameHint.innerText(), /En az 3/);
  await playerName.fill('Çağrı7!');
  assert.equal(await playerName.inputValue(), 'Çağrı');
  assert.match(await nicknameHint.innerText(), /Yalnızca harf ve boşluk/);
  await playerName.fill('abcdefghijklmnopq');
  assert.equal(await playerName.inputValue(), 'abcdefghijklmnop');
  assert.match(await nicknameHint.innerText(), /En fazla 16/);
  await playerName.fill('Şeyma');
  assert.equal(await page.locator('.nickname-count').innerText(), '5 / 16');

  const selectedAvatar = page.locator('input[name="player-avatar"]:checked');
  await selectedAvatar.focus();
  await page.keyboard.press('ArrowRight');
  assert.equal(await selectedAvatar.count(), 1);
  assert.equal(await selectedAvatar.inputValue(), 'avatar-02');
  assert.equal(
    await page.locator('input[name="player-avatar"]:checked + .avatar-frame .avatar-check').innerText(),
    '✓'
  );
  console.log('Turkish fonts, live nickname validation and keyboard avatar selection passed');

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
