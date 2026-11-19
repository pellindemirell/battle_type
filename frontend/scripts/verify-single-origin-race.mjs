import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { chromium } from 'playwright';

const baseUrl = process.env.SINGLE_ORIGIN_BASE_URL ?? 'http://127.0.0.1:5027';
const origin = new URL(baseUrl);
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
  const firstContext = await browser.newContext();
  const secondContext = await browser.newContext();
  const firstPage = await firstContext.newPage();
  const secondPage = await secondContext.newPage();
  const firstNetwork = await monitorConnection(firstContext, firstPage, sessions);
  const secondNetwork = await monitorConnection(secondContext, secondPage, sessions);

  await Promise.all([
    firstPage.goto(new URL('/race', origin).href, { waitUntil: 'domcontentloaded' }),
    secondPage.goto(new URL('/race', origin).href, { waitUntil: 'domcontentloaded' })
  ]);

  await firstPage.getByPlaceholder('Oyuncu adın').fill('Player One');
  await firstPage.getByLabel('Türkçe karakter modu').selectOption('simplified');
  await firstPage.getByRole('button', { name: 'Seçilen ayarlarla oda oluştur' }).click();
  const roomCodeElement = firstPage.locator('.room-code-box strong');
  await roomCodeElement.waitFor({ state: 'visible', timeout: 15_000 });
  const roomCode = (await roomCodeElement.innerText()).trim();
  assert.match(roomCode, /^[A-Z0-9]{5}$/);

  await secondPage.getByPlaceholder('Oyuncu adın').fill('Player Two');
  await secondPage.getByPlaceholder('Oda kodu (5 hane)').fill(roomCode);
  await secondPage.getByRole('button', { name: 'Yarışmaya Katıl' }).click();

  await Promise.all([
    waitForOpponent(firstPage, 'Player Two'),
    waitForOpponent(secondPage, 'Player One')
  ]);
  await Promise.all([
    firstPage.getByRole('button', { name: 'Hazırım' }).click(),
    secondPage.getByRole('button', { name: 'Hazırım' }).click()
  ]);
  await Promise.all([
    firstPage.locator('.keyboard-hint').waitFor({ state: 'visible', timeout: 15_000 }),
    secondPage.locator('.keyboard-hint').waitFor({ state: 'visible', timeout: 15_000 })
  ]);

  const firstText = normalizeTarget(await firstPage.locator('.target-text').innerText());
  const secondText = normalizeTarget(await secondPage.locator('.target-text').innerText());
  assert.equal(firstText, secondText, 'Both players must receive the same race text');
  assert.ok(firstText.length > 0, 'The race text must not be empty');

  await Promise.all([
    firstPage.keyboard.type(firstText, { delay: 30 }),
    secondPage.keyboard.type(secondText, { delay: 30 })
  ]);
  await Promise.all([
    firstPage.locator('.finish-screen').waitFor({ state: 'visible', timeout: 30_000 }),
    secondPage.locator('.finish-screen').waitFor({ state: 'visible', timeout: 30_000 })
  ]);

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
  console.log('Two-player race passed over HTTP on one origin; both negotiate requests were same-origin and both WebSockets returned 101.');
} finally {
  for (const session of sessions) {
    await session.detach();
  }
  await browser.close();
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
    expectedName => document.querySelector('.ready-controls')?.textContent?.includes(expectedName),
    name,
    { timeout: 15_000 }
  );
}

function normalizeTarget(text) {
  return text.replace(/\u00a0/g, ' ').trim();
}
