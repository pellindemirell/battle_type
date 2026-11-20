import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { chromium } from 'playwright';

const baseUrl = process.env.SINGLE_ORIGIN_BASE_URL ?? 'http://127.0.0.1:5027';
const origin = new URL(baseUrl);
const screenshotDirectory = process.env.TYPEBATTLE_SCREENSHOTS;
const desktop = { width: 1440, height: 1000 };
const mobile = { width: 320, height: 900 };
const chromePath = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH
  ?? [
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe'
  ].find(path => existsSync(path));

assert.equal(origin.protocol, 'http:', 'The single-origin test must run without HTTPS');

const response = await fetch(origin);
assert.equal(response.status, 200, `The application did not respond at ${baseUrl}`);

if (origin.port === '4200') {
  const backendUrl = new URL(
    '/raceHub/negotiate?negotiateVersion=1',
    process.env.DEV_BACKEND_URL ?? 'http://localhost:5027'
  );
  const preflight = await fetch(backendUrl, {
    method: 'OPTIONS',
    headers: {
      Origin: origin.origin,
      'Access-Control-Request-Method': 'POST',
      'Access-Control-Request-Headers': 'x-requested-with,content-type'
    }
  });
  assert.equal(preflight.status, 204, 'The development CORS preflight must succeed');
  assert.equal(
    preflight.headers.get('access-control-allow-origin'),
    origin.origin,
    'The development backend must allow the Angular origin'
  );
  console.log(`Development CORS preflight allowed ${origin.origin}`);
}

const browser = await chromium.launch({
  headless: true,
  ...(chromePath ? { executablePath: chromePath } : {})
});
const sessions = [];

try {
  const firstContext = await browser.newContext({ viewport: desktop });
  const secondContext = await browser.newContext({ viewport: desktop });
  const firstPage = await firstContext.newPage();
  const secondPage = await secondContext.newPage();
  const firstNetwork = await monitorConnection(firstContext, firstPage, sessions);
  const secondNetwork = await monitorConnection(secondContext, secondPage, sessions);

  await Promise.all([
    firstPage.goto(new URL('/race', origin).href, { waitUntil: 'domcontentloaded' }),
    secondPage.goto(new URL('/race', origin).href, { waitUntil: 'domcontentloaded' })
  ]);

  await firstPage.getByPlaceholder('Oyuncu adın').fill('Player One');
  const choices = firstPage.locator('input[name="player-avatar"]');
  assert.equal(await choices.count(), 12, 'All twelve avatar choices must appear');
  await firstPage.locator('.avatar-option').filter({
    has: choices.filter({ has: undefined }).and(firstPage.locator('[value="avatar-08"]'))
  }).click();
  await firstPage.reload({ waitUntil: 'domcontentloaded' });
  await firstPage.locator('input[name="player-avatar"]:checked[value="avatar-08"]').waitFor({
    state: 'attached'
  });
  assert.equal(await firstPage.getByPlaceholder('Oyuncu adın').inputValue(), 'Player One');
  assert.equal(await firstPage.locator('input[name="player-avatar"]:checked').count(), 1);
  await assertPlayerAvatar(firstPage, '.avatar-option:has(input:checked)', '', 'avatar-08');
  await capture(firstPage, 'type-battle-profil.png');

  await firstPage.setViewportSize(mobile);
  const mobileAvatarBoxes = await firstPage.locator('.avatar-option').evaluateAll((options) =>
    options.map((option) => option.getBoundingClientRect().x)
  );
  assert.equal(new Set(mobileAvatarBoxes).size, 4, 'Mobile avatar grid must have four columns');
  await capture(firstPage, 'type-battle-profil-mobil.png');
  await firstPage.setViewportSize(desktop);

  await firstPage.locator('.difficulty-card').nth(1).click();
  await firstPage.getByLabel('Türkçe karakter modu').selectOption('simplified');
  await firstPage.getByRole('button', { name: 'Seçilen ayarlarla oda oluştur' }).click();
  const roomCodeElement = firstPage.locator('.room-code-box strong');
  await roomCodeElement.waitFor({ state: 'visible', timeout: 15_000 });
  const roomCode = (await roomCodeElement.innerText()).trim();
  assert.match(roomCode, /^[A-Z0-9]{5}$/);
  assert.equal(await firstPage.locator('.target-text').count(), 0);
  await firstPage.locator('.waiting-text').waitFor({ state: 'visible' });

  await assertPlayerAvatar(firstPage, '.player-card', 'Player One', 'avatar-08');
  await secondPage.getByPlaceholder('Oyuncu adın').fill('Player Two');
  await secondPage.locator('input[name="player-avatar"]:checked').focus();
  await secondPage.keyboard.press('ArrowRight');
  assert.equal(
    await secondPage.locator('input[name="player-avatar"]:checked').inputValue(), 'avatar-02'
  );
  await secondPage.getByPlaceholder('Oda kodu (5 hane)').fill(roomCode);
  await secondPage.getByRole('button', { name: 'Yarışmaya Katıl' }).click();

  await Promise.all([
    waitForOpponent(firstPage, 'Player Two'),
    waitForOpponent(secondPage, 'Player One')
  ]);
  await assertBothAvatars(firstPage, secondPage, '.player-card');
  await capture(firstPage, 'type-battle-lobi.png');

  for (const page of [firstPage, secondPage]) {
    assert.equal(await page.locator('.target-text').count(), 0);
    assert.match(await page.locator('.waiting-text').innerText(), /Her iki oyuncu hazır/);
    assert.equal(await page.locator('.race-clock time').innerText(), '00:00.0');
  }

  await firstPage.getByRole('button', { name: 'Hazırım' }).click();
  await secondPage.getByText('Rakip HAZIR', { exact: true }).waitFor();
  await firstPage.getByRole('button', { name: 'Hazır ✓' }).waitFor();
  assert.equal(await firstPage.locator('.countdown-number').count(), 0);
  assert.equal(await secondPage.locator('.target-text').count(), 0);

  await secondPage.getByRole('button', { name: 'Hazırım' }).click();
  for (const digit of ['3', '2', '1']) {
    await firstPage.locator(`.target-text-box .countdown-number:text-is(\"${digit}\")`).waitFor();
    assert.equal(await firstPage.locator('.target-text').count(), 0);
  }
  await Promise.all([firstPage, secondPage].map(page =>
    page.locator('.target-text').waitFor({ state: 'visible', timeout: 15000 })
  ));
  for (const page of [firstPage, secondPage]) {
    await page.waitForFunction(() => document.querySelector('input[name="chatText"]')?.disabled);
  }
  await Promise.all([assertTextFitsViewport(firstPage), assertTextFitsViewport(secondPage)]);
  await firstPage.setViewportSize(desktop);

  await assertBothAvatars(firstPage, secondPage, '.player-card');
  await capture(firstPage, 'type-battle-yaris.png');

  const firstText = normalizeTarget(
    (await firstPage.locator('.target-text').textContent()) ?? ''
  );
  const secondText = normalizeTarget(
    (await secondPage.locator('.target-text').textContent()) ?? ''
  );
  assert.equal(firstText, secondText, 'Both players must receive the same race text');
  assert.ok(firstText.length > 0, 'The race text must not be empty');

  await firstPage.keyboard.type(firstText, { delay: 70 });
  await Promise.all([
    firstPage.locator('.finish-screen').waitFor({ state: 'visible', timeout: 30_000 }),
    secondPage.locator('.finish-screen').waitFor({ state: 'visible', timeout: 30_000 })
  ]);

  await assertBothAvatars(firstPage, secondPage, '.results-table tbody tr');
  for (const page of [firstPage, secondPage]) {
    const winnerAvatar = await page.locator('.winner-row img').getAttribute('src');
    const hero = page.locator('.winner-identity img');
    assert.equal(await hero.getAttribute('src'), winnerAvatar);
    assert.ok(await hero.evaluate((img) => img.getBoundingClientRect().width > 44));
  }
  await capture(firstPage, 'type-battle-sonuclar.png');

  for (const [label, network] of [
    ['first player', firstNetwork],
    ['second player', secondNetwork]
  ]) {
    const negotiate = network.negotiateRequests.find(request =>
      request.pathname === '/raceHub/negotiate'
    );
    assert.ok(negotiate, `${label} did not send a SignalR negotiate request`);
    assert.equal(negotiate.origin, origin.origin, `${label} negotiate left the app origin`);
    assert.equal(negotiate.method, 'POST');
    assert.ok(
      network.webSocketStatuses.includes(101),
      `${label} did not establish a WebSocket with status 101`
    );
  }

  assert.equal(
    await firstPage.locator('.winner-row').count(),
    1,
    'The race result must contain exactly one winner'
  );
  assert.match(await firstPage.locator('.winner-identity').innerText(), /Player One\s*—\s*\d{2}:\d{2}\.\d{2}/);
  await secondPage.getByText('Bitirmedi', { exact: true }).waitFor();
  await firstPage.getByRole('button', { name: 'Rövanş iste' }).click();
  const request = firstPage.getByRole('dialog', { name: 'Rövanş iste' });
  assert.equal((await request.locator('select option:checked').innerText()).trim(), '3 tur');
  await request.getByRole('button', { name: 'İsteği gönder' }).click();
  await firstPage.getByText('Bekleniyor…', { exact: true }).waitFor();

  const offer = secondPage.getByRole('dialog', { name: 'Player One rövanş istiyor — 3 tur' });
  await offer.waitFor();
  assert.equal(await offer.evaluate(dialog => dialog.contains(document.activeElement)), true);
  await offer.getByRole('button', { name: 'Kabul' }).click();

  for (const page of [firstPage, secondPage]) {
    await page.getByText(/Tur 1\/3 · Sen 0 – Rakip 0/).waitFor();
    assert.equal(await page.locator('.target-text').count(), 0);
    assert.equal(await page.locator('.race-clock time').innerText(), '00:00.0');
  }

  console.log('Two-player readiness, countdown, text reveal, result time and three-round rematch passed.');
} finally {
  for (const session of sessions) {
    await session.detach();
  }
  await browser.close();
}

async function assertBothAvatars(first, second, container) {
  await Promise.all(
    [first, second].flatMap((page) => [
      assertPlayerAvatar(page, container, 'Player One', 'avatar-08'),
      assertPlayerAvatar(page, container, 'Player Two', 'avatar-02')
    ])
  );
}

async function assertPlayerAvatar(page, container, nickname, avatarId) {
  await page.waitForFunction(({ container, nickname, avatarId }) =>
    Array.from(document.querySelectorAll(container)).some((element) => {
      const image = element.querySelector('img');
      return element.textContent.includes(nickname) &&
        image?.getAttribute('src') === `/assets/avatars/${avatarId}.png` &&
        image.complete && image.naturalWidth === 256;
    }),
    { container, nickname, avatarId },
    { timeout: 15_000 }
  );
}

async function capture(page, name) {
  if (!screenshotDirectory) return;
  await mkdir(screenshotDirectory, { recursive: true });
  await page.screenshot({
    path: join(screenshotDirectory, name),
    fullPage: true,
    animations: 'disabled'
  });
}

async function monitorConnection(context, page, sessions) {
  const network = {
    negotiateRequests: [],
    webSocketStatuses: []
  };
  const cdp = await context.newCDPSession(page);
  await cdp.send('Network.enable');
  const webSocketRequestIds = new Set();
  cdp.on('Network.webSocketCreated', event => {
    const url = new URL(event.url);
    if (url.pathname === '/raceHub')
      webSocketRequestIds.add(event.requestId);
  });
  cdp.on('Network.webSocketHandshakeResponseReceived', event => {
    if (webSocketRequestIds.has(event.requestId))
      network.webSocketStatuses.push(event.response.status);
  });
  page.on('request', request => {
    const url = new URL(request.url());
    if (url.pathname === '/raceHub/negotiate') {
      network.negotiateRequests.push({
        origin: url.origin,
        pathname: url.pathname,
        method: request.method()
      });
    }
  });
  sessions.push(cdp);
  return network;
}

async function waitForOpponent(page, name) {
  await page.waitForFunction(
    expectedName => document.querySelector('.player-card.opponent h3')?.textContent?.includes(expectedName),
    name,
    { timeout: 15_000 }
  );
}

async function assertTextFitsViewport(page) {
  await page.setViewportSize({ width: 320, height: 900 });
  const layout = await page.locator('.target-text').evaluate(element => {
    const box = element.closest('.target-text-box');
    const boxStyle = getComputedStyle(box);
    const boxBounds = box.getBoundingClientRect();
    const contentLeft =
      boxBounds.left +
      parseFloat(boxStyle.borderLeftWidth) +
      parseFloat(boxStyle.paddingLeft);
    const contentRight =
      boxBounds.right -
      parseFloat(boxStyle.borderRightWidth) -
      parseFloat(boxStyle.paddingRight);

    return {
      clientWidth: element.clientWidth,
      scrollWidth: element.scrollWidth,
      words: Array.from(element.querySelectorAll('.target-word'), word => {
        const bounds = word.getBoundingClientRect();
        return { left: bounds.left, right: bounds.right };
      }),
      contentLeft,
      contentRight
    };
  });

  assert.ok(
    layout.scrollWidth <= layout.clientWidth + 1,
    'Target text must not overflow horizontally'
  );
  assert.ok(
    layout.words.every(word =>
      word.left >= layout.contentLeft - 1 &&
      word.right <= layout.contentRight + 1
    ),
    'Each target word must stay inside the text box'
  );
}

function normalizeTarget(text) {
  return text.replace(/\u00a0/g, ' ').trim();
}
