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
  if (await firstPage.evaluate(() => window.isSecureContext)) {
    await firstContext.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: origin.origin });
  }

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
  await roomCodeElement.evaluate(el => {
    const box = el.parentElement.getBoundingClientRect();
    if (Math.abs(box.width - box.height) > 1 || box.width < 150) throw new Error('Room code tile must be square.');
  });
  await firstPage.getByRole('button', { name: 'Kodu kopyala', exact: true }).press('Enter');
  const copyFeedback = firstPage.getByText('Kopyalandı!', { exact: true });
  await copyFeedback.waitFor();
  assert.equal(await firstPage.getByRole('button', { name: 'Kod kopyalandı' }).isDisabled(), true);
  if (await firstPage.evaluate(() => !!navigator.clipboard)) {
    assert.equal(await firstPage.evaluate(() => navigator.clipboard.readText()), roomCode);
  }
  await copyFeedback.waitFor({ state: 'hidden' });
  await firstPage.getByRole('button', { name: 'Davet bağlantısı oluştur' }).click();
  const inviteBox = firstPage.locator('.invite-link');
  const inviteText = inviteBox.locator('code');
  assert.match(await inviteText.innerText(), /^https?:\/\/\*+$/);
  const layout = await inviteBox.evaluate(el => {
    const card = el.getBoundingClientRect();
    const createButton = el.previousElementSibling.getBoundingClientRect();
    return { square: Math.abs(card.width - card.height) <= 1, below: card.top >= createButton.bottom };
  });
  assert.deepEqual(layout, { square: true, below: true });
  await firstPage.getByRole('button', { name: 'Bağlantıyı göster' }).press('Enter');
  await firstPage.waitForFunction(() => document.querySelector('#invite-url')?.getAttribute('aria-hidden') === null);
  const inviteUrl = new URL(await inviteText.innerText());
  assert.equal(inviteUrl.origin, origin.origin);
  assert.equal(inviteUrl.searchParams.get('room'), roomCode);
  await assertIconControls(firstPage);
  await firstPage.getByRole('button', { name: 'Bağlantıyı gizle' }).click();
  await firstPage.waitForFunction(() => /^https?:\/\/\*+$/.test(document.querySelector('#invite-url')?.textContent.trim() ?? ''));
  await firstPage.getByRole('button', { name: 'Bağlantıyı kopyala' }).click();
  await firstPage.getByText('Davet bağlantısı kopyalandı.', { exact: true }).waitFor();
  assert.equal(await firstPage.getByRole('button', { name: 'Kopyalandı', exact: true }).isDisabled(), true);
  if (await firstPage.evaluate(() => !!navigator.clipboard)) {
    assert.equal(await firstPage.evaluate(() => navigator.clipboard.readText()), inviteUrl.href);
  }
  assert.equal(await firstPage.locator('.target-text').count(), 0);
  await firstPage.locator('.waiting-text').waitFor({ state: 'visible' });

  await assertPlayerAvatar(firstPage, '.player-card', 'Player One', 'avatar-08');
  await secondPage.goto(inviteUrl.href, { waitUntil: 'domcontentloaded' });
  await secondPage.getByPlaceholder('Oyuncu adın').fill('Player Two');
  await secondPage.locator('input[name="player-avatar"]:checked').focus();
  await secondPage.keyboard.press('ArrowRight');
  assert.equal(
    await secondPage.locator('input[name="player-avatar"]:checked').inputValue(), 'avatar-02'
  );
  const joinCode = secondPage.getByPlaceholder('Oda kodu (5 hane)');
  await secondPage.waitForFunction(code => document.querySelector('#room-code')?.value === code, roomCode);
  await joinCode.press('Enter');

  await Promise.all([
    waitForOpponent(firstPage, 'Player Two'),
    waitForOpponent(secondPage, 'Player One')
  ]);
  await firstPage.getByText('Player Two odaya katıldı.', { exact: true }).waitFor();
  await secondPage.getByText('Player One hazırlanıyor…', { exact: true }).waitFor();
  await assertBothAvatars(firstPage, secondPage, '.player-card');
  await capture(firstPage, 'type-battle-lobi.png');

  for (const page of [firstPage, secondPage]) {
    assert.equal(await page.locator('.target-text').count(), 0);
    assert.match(await page.locator('.waiting-text').innerText(), /Her iki oyuncu hazır/);
    assert.equal(await page.locator('.race-clock, .progress-label, .error-label').count(), 0);
    assert.deepEqual(await page.locator('.room-settings dt').allTextContents(), [
      'Zorluk', 'Metin uzunluğu', 'Türkçe karakter modu'
    ]);
    assert.equal(await page.locator('.room-settings dd small').count(), 0);
  }

  const settingsButton = firstPage.getByRole('button', { name: 'Oda ayarlarını değiştir' });
  const editor = firstPage.getByRole('dialog', { name: 'Oda ayarlarını değiştir' });
  const approval = secondPage.getByRole('dialog', { name: 'Player One oda ayarlarını değiştirmek istiyor' });
  await settingsButton.click();
  await editor.getByLabel('Metin uzunluğu').selectOption({ label: '45 kelime' });
  await editor.getByRole('button', { name: 'Onaya gönder' }).click();
  await approval.getByText('45 kelime', { exact: true }).waitFor();
  assert.match(await firstPage.locator('.room-summary').innerText(), /30 kelime/);
  await approval.getByRole('button', { name: 'Reddet' }).click();
  await firstPage.locator('.room-toast').filter({ hasText: /^Oda ayarları değiştirilemedi\.$/ }).waitFor();
  assert.match(await firstPage.locator('.room-summary').innerText(), /30 kelime/);
  await settingsButton.click();
  await editor.getByLabel('Zorluk').selectOption('easy');
  await editor.getByRole('button', { name: 'Onaya gönder' }).click();
  await approval.getByText('Kolay', { exact: true }).waitFor();
  await approval.getByRole('button', { name: 'Onayla' }).click();
  for (const page of [firstPage, secondPage]) {
    await page.locator('.room-summary .room-settings').getByText('Kolay', { exact: true }).waitFor();
  }

  await firstPage.setViewportSize({ width: 320, height: 600 });
  await firstPage.locator('.race-chat summary').click();
  const chatPanel = firstPage.locator('.race-chat');
  const chatHeight = await chatPanel.evaluate(el => el.getBoundingClientRect().height);
  const chatInput = firstPage.getByRole('textbox', { name: 'Sohbet mesajı' });
  const secondMessage = `Ikinci mesaj ${'W'.repeat(110)}`;
  await chatInput.fill('Merhaba rakip');
  await firstPage.getByRole('button', { name: 'Gönder', exact: true }).click();
  assert.equal(await chatInput.evaluate(el => el === document.activeElement), true);
  await firstPage.keyboard.type(secondMessage);
  await secondPage.locator('.chat-unread').waitFor();
  await secondPage.locator('.race-chat summary').click();
  await secondPage.getByText('Merhaba rakip', { exact: true }).waitFor();
  await firstPage.getByText('Merhaba rakip', { exact: true }).waitFor();
  assert.equal(await chatInput.inputValue(), secondMessage);
  await firstPage.keyboard.press('Enter');
  const cooldown = firstPage.locator('.chat-feedback.has-error');
  assert.match(await cooldown.innerText(), /Mesaj göndermek için 3 saniye bekle\./);
  assert.equal(await cooldown.evaluate(el => getComputedStyle(el).color), 'rgb(255, 214, 10)');
  assert.equal(await secondPage.getByText(secondMessage, { exact: true }).count(), 0);
  assert.equal(await chatInput.inputValue(), secondMessage);
  await cooldown.waitFor({ state: 'detached' });
  await firstPage.keyboard.press('Enter');
  await secondPage.getByText(secondMessage, { exact: true }).waitFor();
  assert.equal(await chatInput.evaluate(el => el === document.activeElement), true);
  const reply = `Oyuncu iki ${'M'.repeat(110)}`;
  await secondPage.getByRole('textbox', { name: 'Sohbet mesajı' }).fill(reply);
  await secondPage.getByRole('button', { name: 'Gönder', exact: true }).click();
  await firstPage.getByText(reply, { exact: true }).waitFor();
  const chatAuthor = firstPage.locator('.chat-opponent').filter({ hasText: /^Player Two$/ });
  assert.equal(await chatAuthor.evaluate(el => getComputedStyle(el).color), 'rgb(255, 214, 10)');
  await firstPage.waitForFunction(() => {
    const history = document.querySelector('.chat-history');
    return history && history.scrollTop > 0 &&
      history.scrollHeight - history.clientHeight - history.scrollTop <= 1;
  });
  assert.equal(await chatPanel.evaluate(el => el.getBoundingClientRect().height), chatHeight);
  await verifyEmoteChat(firstPage, secondPage);
  await firstPage.setViewportSize(desktop);

  const ready = firstPage.getByRole('button', { name: 'Hazırım' });
  assert.ok(await ready.evaluate(button => button.getBoundingClientRect().height >= 56));
  assert.equal(await secondPage.locator('.opponent-status').evaluate(el => getComputedStyle(el).color), 'rgb(255, 214, 10)');
  await ready.click();
  const readyLock = firstPage.getByRole('button', { name: 'Bekliyorum', exact: true });
  assert.equal(await readyLock.isDisabled(), true);
  await secondPage.getByText('Player One Hazır !', { exact: true }).waitFor();
  assert.equal(await secondPage.locator('.opponent-status').evaluate(el => getComputedStyle(el).color), 'rgb(57, 255, 20)');
  await firstPage.waitForFunction(() => !document.querySelector('.ready-button')?.disabled);
  assert.equal(await firstPage.locator('.countdown-number').count(), 0);
  assert.equal(await secondPage.locator('.target-text').count(), 0);

  await secondPage.getByRole('button', { name: 'Hazırım' }).click();
  for (const digit of ['3', '2', '1']) {
    await firstPage.locator(`.target-text-box .countdown-number:text-is(\"${digit}\")`).waitFor();
    if (digit === '3') {
      const style = await firstPage.locator('.target-text-box .countdown-number').evaluate(el => {
        const css = getComputedStyle(el);
        return [css.color, Number.parseFloat(css.fontSize), Number.parseInt(css.fontWeight, 10)];
      });
      assert.equal(style[0], 'rgb(255, 214, 10)');
      assert.ok(style[1] >= 64 && style[2] >= 700);
    }
    assert.equal(await firstPage.locator('.target-text').count(), 0);
    assert.equal(await firstPage.locator('.race-clock, .progress-label, .error-label').count(), 0);
  }
  await Promise.all([firstPage, secondPage].map(page =>
    page.locator('.target-text').waitFor({ state: 'visible', timeout: 15000 })
  ));
  for (const page of [firstPage, secondPage]) {
    await page.waitForFunction(() => document.querySelector('input[name="chatText"]')?.disabled);
    assert.equal(await page.getByRole('button', { name: 'Emoji seç' }).isDisabled(), true);
    assert.equal(await page.locator('.room-details').count(), 0);
    const box = await page.locator('.target-text-box').boundingBox();
    const viewport = page.viewportSize();
    assert.ok(box.height >= 192);
    assert.ok(Math.abs(box.x + box.width / 2 - viewport.width / 2) <= 10);
    assert.equal(await page.locator('.race-clock time').count(), 1);
    assert.equal(await page.locator('.progress-label').count(), 2);
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

  const keyboard = firstPage.locator('app-race-keyboard');
  assert.equal(await keyboard.locator('.key.next').first().evaluate(el => getComputedStyle(el).backgroundColor), 'rgb(255, 214, 10)');
  await firstPage.keyboard.press(firstText[0] === 'x' ? 'z' : 'x');
  const wrong = keyboard.locator('.key.wrong').first();
  await wrong.waitFor();
  assert.equal(await wrong.evaluate(el => getComputedStyle(el).backgroundColor), 'rgb(229, 72, 77)');
  await firstPage.waitForTimeout(60);
  await firstPage.keyboard.type(firstText[0]);
  const correct = keyboard.locator('.key.correct').first();
  await correct.waitFor();
  assert.equal(await correct.evaluate(el => getComputedStyle(el).backgroundColor), 'rgb(63, 185, 80)');
  await firstPage.waitForTimeout(60);
  await Promise.all([
    firstPage.keyboard.type(firstText.slice(1), { delay: 70 }),
    firstPage.locator('.encouragement strong').waitFor({ timeout: 15000 })
  ]);
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
  await secondPage.setViewportSize(mobile);
  const mobileResult = await secondPage.locator('.finish-screen').evaluate(screen => ({
    pageFits: document.documentElement.scrollWidth === document.documentElement.clientWidth,
    resultsFit: screen.querySelector('.results-table-wrapper').scrollWidth <=
      screen.querySelector('.results-table-wrapper').clientWidth + 1
  }));
  assert.deepEqual(mobileResult, { pageFits: true, resultsFit: true });
  await capture(secondPage, 'type-battle-sonuclar-mobil.png');

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
  await secondPage.locator('.results-table tbody tr').filter({ hasText: /Bitirmedi/ }).waitFor();
  const request = firstPage.getByRole('dialog', { name: 'Rövanş iste' });
  const offer = secondPage.getByRole('dialog', { name: 'RÖVANŞ MEYDAN OKUMASI' });
  const sendOffer = async () => {
    await firstPage.getByRole('button', { name: 'Rövanş iste' }).click();
    assert.equal((await request.locator('select option:checked').innerText()).trim(), '3 tur');
    await request.getByRole('button', { name: 'İsteği gönder' }).click();
    await firstPage.getByText('Bekleniyor…', { exact: true }).waitFor();
    await offer.waitFor();
  };

  await sendOffer();
  await assertRematchChallenge(secondPage, offer);
  await secondPage.keyboard.press('Escape');
  await offer.waitFor({ state: 'hidden' });
  await firstPage.locator('.room-toast').filter({ hasText: /^Rakip rövanş isteğini reddetti\.$/ }).waitFor();

  await sendOffer();
  await offer.getByRole('button', { name: 'Rövanş isteğini reddet' }).click();
  await offer.waitFor({ state: 'hidden' });

  await sendOffer();
  await firstPage.getByRole('button', { name: 'İsteği iptal et' }).click();
  await offer.waitFor({ state: 'hidden' });
  await firstPage.locator('.room-toast').filter({ hasText: /^Rövanş isteği iptal edildi\.$/ }).waitFor();

  await sendOffer();
  await offer.getByRole('button', { name: 'Meydan Oku!' }).click();

  for (const page of [firstPage, secondPage]) {
    await page.getByText(/Tur 1\/3 · Sen 0 – Rakip 0/).waitFor();
    assert.equal(await page.locator('.target-text').count(), 0);
    assert.equal(await page.locator('.race-clock, .progress-label, .error-label').count(), 0);
  }

  await Promise.all([
    secondPage.waitForURL(new URL('/', origin).href),
    secondPage.getByRole('button', { name: 'Ana menü', exact: true }).click()
  ]);
  await firstPage.locator('.room-toast').filter({ hasText: /^Player Two oyundan ayrıldı !$/ }).waitFor();
  console.log('Two-player lobby, race, rematch and leave flow passed.');
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

async function assertIconControls(page) {
  const expectedSizes = { homepage: 26, config: 26, 'room-copy': 22, 'invite-copy': 20, 'not-visible': 20 };
  const buttons = page.locator('.icon-button');
  for (const width of [375, 768, 1440]) {
    await page.setViewportSize({ width, height: desktop.height });
    await page.waitForFunction(() => {
      const images = [...document.querySelectorAll('.icon-button img')];
      return images.length === 5 && images.every(image => image.complete && image.naturalWidth > 0);
    });
    const controls = await buttons.evaluateAll(elements => elements.map(button => {
      const image = button.querySelector('img');
      const bounds = button.getBoundingClientRect();
      const icon = image.parentElement;
      const asset = new URL(image.src).pathname.split('/').at(-1).replace('.png', '');
      return {
        name: asset === 'copy' ? (button.closest('.invite-link') ? 'invite-copy' : 'room-copy') : asset,
        alt: image.alt,
        fit: getComputedStyle(image).objectFit,
        size: icon.offsetWidth,
        fits: bounds.width >= 44 && bounds.height >= 44 && bounds.left >= 0 && bounds.right <= innerWidth
      };
    }));
    assert.equal(controls.length, 5);
    for (const icon of controls) {
      assert.equal(icon.alt, '');
      assert.equal(icon.fit, 'contain');
      assert.equal(icon.size, expectedSizes[icon.name]);
      assert.equal(icon.fits, true, `${icon.name} should fit at ${width}px`);
    }
    const pageFits = await page.evaluate(() => document.documentElement.scrollWidth === document.documentElement.clientWidth);
    assert.equal(pageFits, true, `The page should fit at ${width}px`);
    if (width >= 768) {
      const home = await page.locator('.lobby-actions').boundingBox();
      assert.ok(home.x < 40 && home.y < 40);
    }
  }

  const config = page.getByRole('button', { name: 'Oda ayarlarını değiştir', exact: true });
  const roomDetails = page.locator('.room-details');
  const layout = () => roomDetails.evaluate(el => [el.offsetTop, el.offsetLeft, el.offsetWidth, el.offsetHeight]);
  const beforeHover = await layout();
  await config.hover();
  await page.waitForFunction(() => getComputedStyle(document.querySelector('.room-setting-actions .icon-button')).transform !== 'none');
  assert.deepEqual(await layout(), beforeHover);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const reduced = await config.evaluate(el => {
    const style = getComputedStyle(el);
    return { transform: style.transform, duration: style.transitionDuration };
  });
  assert.deepEqual(reduced, { transform: 'none', duration: '0s' });
  await page.emulateMedia({ reducedMotion: 'no-preference' });
}

async function verifyEmoteChat(sender, recipient) {
  const cooldownElapsed = new Promise(resolve => setTimeout(resolve, 3100));
  await sender.setViewportSize({ width: 375, height: 850 });
  await sender.bringToFront();
  const trigger = sender.getByRole('button', { name: 'Emoji seç' });
  const picker = sender.getByRole('dialog', { name: 'Emoji seçici' });
  const laugh = picker.getByRole('button', { name: 'Kahkaha', exact: true });
  assert.equal(await picker.count(), 0);
  await trigger.press('Enter');
  await laugh.waitFor();
  assert.equal(await picker.getByRole('button').count(), 20);
  const panel = await picker.boundingBox();
  assert.ok(panel.x >= 0 && panel.x + panel.width <= 375);
  assert.equal(await picker.locator('.emote-grid').evaluate(el => getComputedStyle(el).gridTemplateColumns.split(' ').length), 5);
  await assertAvatarStickerPack(picker, 'avatar-08');

  await sender.keyboard.press('Escape');
  await picker.waitFor({ state: 'detached' });
  assert.equal(await trigger.evaluate(el => document.activeElement === el), true);
  await trigger.click();
  await sender.getByRole('textbox', { name: 'Sohbet mesajı' }).click();
  await picker.waitFor({ state: 'detached' });

  await sender.emulateMedia({ reducedMotion: 'reduce' });
  await trigger.click();
  await assertAvatarStickerPack(picker, 'avatar-08');
  await cooldownElapsed;
  await picker.getByRole('button', { name: 'Kahkaha', exact: true }).press('Enter');
  await picker.waitFor({ state: 'detached' });
  await assertChatSticker([sender, recipient], 'avatar-08');
  await sender.emulateMedia({ reducedMotion: 'no-preference' });

  await recipient.getByRole('button', { name: 'Emoji seç' }).click();
  const secondPicker = recipient.getByRole('dialog', { name: 'Emoji seçici' });
  await assertAvatarStickerPack(secondPicker, 'avatar-02');
  await secondPicker.getByRole('button', { name: 'Kahkaha', exact: true }).click();
  await assertChatSticker([sender, recipient], 'avatar-02');
}

async function assertAvatarStickerPack(picker, avatarId) {
  await picker.waitFor();
  const paths = await picker.locator('.emote-option img').evaluateAll(async images => {
    await Promise.all(images.map(image => image.decode()));
    return images.map(image => new URL(image.currentSrc).pathname);
  });
  const expected = Array.from({ length: 20 }, (_, index) =>
    `/assets/emotes/avatars/${avatarId}/${String(index + 1).padStart(2, '0')}.png`
  );
  assert.deepEqual(paths, expected);
}

async function assertChatSticker(pages, avatarId) {
  const path = `/assets/emotes/avatars/${avatarId}/01.png`;
  await Promise.all(pages.map(async page => {
    const image = page.locator(`.chat-history img[alt="Kahkaha"][src="${path}"]`);
    await image.scrollIntoViewIfNeeded();
    assert.equal(await image.evaluate(async el => {
      await el.decode();
      return new URL(el.currentSrc).pathname;
    }), path);
  }));
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

async function assertRematchChallenge(page, offer) {
  assert.equal(await offer.getAttribute('aria-modal'), 'true');
  assert.equal(await offer.getAttribute('aria-describedby'), 'rematch-challenge-description');
  await assertPlayerAvatar(page, '.challenge-player.challenger', 'Player One', 'avatar-08');
  await assertPlayerAvatar(page, '.challenge-player.recipient', 'Player Two', 'avatar-02');
  await offer.getByText('Rakibin seni yeniden düelloya çağırıyor!', { exact: true }).waitFor();
  assert.deepEqual(await offer.locator('.challenge-settings dd').allTextContents(), ['3', '30', 'Kolay']);
  assert.match(await offer.evaluate(dialog => getComputedStyle(dialog).animationName), /challenge-enter/);
  assert.equal(await offer.evaluate(dialog => getComputedStyle(dialog, '::backdrop').backdropFilter), 'blur(5px)');

  for (const width of [320, 375, 768, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    const fits = await offer.evaluate(dialog => {
      const box = dialog.getBoundingClientRect();
      return box.left >= 0 && box.right <= innerWidth && box.top >= 0 && box.bottom <= innerHeight
        && dialog.scrollWidth <= dialog.clientWidth;
    });
    assert.equal(fits, true, `Rematch modal should fit at ${width}px`);
    if (width === 768) await capture(page, 'type-battle-rovans-meydan-okumasi.png');
  }

  const reject = offer.getByRole('button', { name: 'Reddet', exact: true });
  const close = offer.getByRole('button', { name: 'Rövanş isteğini reddet' });
  await reject.focus();
  await page.keyboard.press('Tab');
  assert.equal(await close.evaluate(el => document.activeElement === el), true);
  await page.keyboard.press('Shift+Tab');
  assert.equal(await reject.evaluate(el => document.activeElement === el), true);

  await page.emulateMedia({ reducedMotion: 'reduce' });
  const animations = await offer.evaluate(dialog => [
    dialog,
    ...dialog.querySelectorAll('.challenge-player, .challenge-vs')
  ].map(element => getComputedStyle(element).animationName));
  assert.ok(animations.every(animation => animation === 'none'));
  await page.emulateMedia({ reducedMotion: 'no-preference' });
}
