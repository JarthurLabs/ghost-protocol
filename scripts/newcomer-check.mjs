import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';

const base = process.env.GHOST_PROTOCOL_URL || process.env.GHOST_PROTOCOL_BASE || 'http://127.0.0.1:5322';
const output = process.env.GHOST_PROTOCOL_CAPTURE_DIR || 'captures/finished-game/newcomer';
const progressKey = 'ghost-protocol-campaign-v1';
const receipt = {
  base, startedAt: new Date().toISOString(),
  evidenceScope: 'Isolated first-time sessions. Actual buttons and keyboard controls, with public read-only state observations. No actor, credential, clock or progression injection. This is a bounded onboarding and controls check, not campaign completion or measured human learning evidence.',
  checks: [], screenshots: [], sessions: [], commands: [], errors: [],
};
await fs.mkdir(output, { recursive: true });
const browser = await chromium.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true, args: ['--use-gl=angle', '--use-angle=metal'] });
receipt.browser = await browser.version();
let activePage;
const record = (name, detail = {}) => { receipt.checks.push({ name, ...detail }); console.log(`PASS ${name}`); };
const state = page => page.evaluate(async () => { const response = await fetch('/api/state'); if (!response.ok) throw Error(`State request: ${response.status}`); return response.json(); });
const progress = page => page.evaluate(key => localStorage.getItem(key), progressKey);
function simulation(s) {
  return Object.fromEntries(['runId', 'levelId', 'status', 'elapsedMs', 'player', 'sentries', 'grants', 'carrying', 'collectedShards', 'extractionProgress', 'decisions'].map(key => [key, s[key]]));
}
async function snapshot(page) { return { simulation: simulation(await state(page)), progress: await progress(page) }; }
async function unchanged(page, before, label) { assert.deepEqual(await snapshot(page), before, label); }
async function until(page, test, label, timeout = 5000) {
  const end = Date.now() + timeout; let latest;
  do { latest = await state(page); if (test(latest)) return latest; await page.waitForTimeout(25); } while (Date.now() < end);
  throw Error(`${label}: ${JSON.stringify(latest)}`);
}
async function pressCommand(page, key) {
  const response = page.waitForResponse(r => r.url().endsWith('/api/command') && r.request().method() === 'POST');
  await page.keyboard.press(key); assert.equal((await response).status(), 200);
}
async function keyboardActivate(page, locator) {
  await locator.focus(); assert(await locator.evaluate(el => el === document.activeElement), 'Control did not receive keyboard focus');
  await page.keyboard.press('Enter');
}
async function focusWrap(page, selector) {
  const controls = page.locator(selector).locator('button:visible:not(:disabled), a[href]:visible, input:visible:not(:disabled), summary:visible, [tabindex="0"]:visible');
  const first = controls.first(), last = controls.last();
  await last.focus(); await page.keyboard.press('Tab'); assert(await first.evaluate(el => el === document.activeElement), 'Tab escaped the learning dialog');
  await page.keyboard.press('Shift+Tab'); assert(await last.evaluate(el => el === document.activeElement), 'Shift+Tab escaped the learning dialog');
}
async function capture(page, name, selector) {
  await page.waitForTimeout(350);
  const bounds = await page.locator(selector).evaluate(el => {
    const b = el.getBoundingClientRect(); return { x: b.x, y: b.y, right: b.right, bottom: b.bottom, width: b.width, height: b.height, scrollWidth: el.scrollWidth, clientWidth: el.clientWidth, scrollHeight: el.scrollHeight, clientHeight: el.clientHeight, viewport: { width: innerWidth, height: innerHeight }, pageScrollWidth: document.documentElement.scrollWidth };
  });
  await page.screenshot({ path: `${output}/${name}.png` });
  assert(bounds.pageScrollWidth <= bounds.viewport.width + 1, `${name}: horizontal page overflow`);
  assert(bounds.scrollWidth <= bounds.clientWidth + 1, `${name}: horizontal panel overflow`);
  assert(bounds.x >= -1 && bounds.right <= bounds.viewport.width + 1 && bounds.y >= -1 && bounds.bottom <= bounds.viewport.height + 1, `${name}: panel outside viewport`);
  receipt.screenshots.push({ name: `${name}.png`, bounds });
}
async function newPage(options, label) {
  const context = await browser.newContext({ deviceScaleFactor: 1, ...options });
  const page = await context.newPage(); activePage = page; page.setDefaultTimeout(12000); page.setDefaultNavigationTimeout(15000);
  page.on('pageerror', e => receipt.errors.push({ session: label, message: e.message }));
  page.on('console', message => { if (message.type() === 'error') receipt.errors.push({ session: label, message: message.text() }); });
  page.on('request', request => { if (request.url().endsWith('/api/command') && request.method() === 'POST') receipt.commands.push({ session: label, command: request.postDataJSON() }); });
  await page.goto(base); await page.getByRole('button', { name: 'Begin operation', exact: true }).waitFor();
  receipt.sessions.push({ label, ...options, scripts: await page.locator('script[src]').evaluateAll(scripts => scripts.map(script => script.src)), stylesheets: await page.locator('link[rel="stylesheet"]').evaluateAll(links => links.map(link => link.href)) });
  return { context, page };
}

try {
  const { context, page } = await newPage({ viewport: { width: 1920, height: 1080 } }, 'standard');
  await keyboardActivate(page, page.getByRole('button', { name: 'Begin operation', exact: true }));
  await page.locator('.showing-intro').waitFor();
  const baseline = await snapshot(page); assert.equal(baseline.simulation.status, 'title'); assert.equal(baseline.simulation.elapsedMs, 0);
  const chapterOne = await page.locator('.intro-caption').innerText();
  await page.waitForTimeout(4700);
  assert.equal(await page.locator('.intro-caption').innerText(), chapterOne, 'Introduction advanced without input');
  assert.equal(await page.locator('.intro-chapters [aria-current="step"]').getAttribute('aria-label'), 'Chapter 1: Your assignment');
  await unchanged(page, baseline, 'Reading the introduction mutated the mission');
  await capture(page, '01-manual-intro-1920', '.learning-panel');
  await focusWrap(page, '.learning-panel');
  await keyboardActivate(page, page.getByRole('button', { name: 'Next chapter', exact: false }));
  assert.equal(await page.locator('.intro-chapters [aria-current="step"]').getAttribute('aria-label'), 'Chapter 2: Borrowed access');
  await keyboardActivate(page, page.getByRole('button', { name: 'Previous chapter', exact: false }));
  assert.equal(await page.locator('.intro-caption').innerText(), chapterOne);
  await keyboardActivate(page, page.getByRole('button', { name: 'Chapter 3: A copied key', exact: true }));
  assert.equal(await page.locator('.intro-chapters [aria-current="step"]').getAttribute('aria-label'), 'Chapter 3: A copied key');
  await page.setViewportSize({ width: 1280, height: 800 });
  await capture(page, '02-manual-intro-1280', '.learning-panel');
  await keyboardActivate(page, page.getByRole('button', { name: 'Next chapter', exact: false }));
  assert.equal(await page.locator('.intro-chapters [aria-current="step"]').getAttribute('aria-label'), 'Chapter 4: Switch access off');
  await page.waitForTimeout(4700); assert.equal(await page.locator('.showing-intro').count(), 1, 'Final chapter started the briefing automatically');
  await keyboardActivate(page, page.getByRole('button', { name: 'Mission briefing', exact: true }));
  await page.getByRole('button', { name: 'Begin mission', exact: false }).waitFor();
  await unchanged(page, baseline, 'Introduction navigation changed the live mission or progression');
  record('Introduction stays at the chosen chapter, supports forward/back/direct navigation, and never starts play', { waitPerBoundaryMs: 4700, keyboardFocusWrapped: true });

  const practice = page.locator('[data-practice-mode="borrowed"]');
  assert.equal(await page.getByRole('button', { name: /^Try the access check/ }).getAttribute('aria-expanded'), 'true', 'First-visit practice must be visible');
  await practice.waitFor(); assert.equal(await practice.getAttribute('data-practice-step'), '0');
  const practiceBaseline = await snapshot(page), commandCount = receipt.commands.length;
  await page.waitForTimeout(4700); assert.equal(await practice.getAttribute('data-practice-step'), '0', 'Practice advanced without input');
  await unchanged(page, practiceBaseline, 'Waiting in practice changed the live mission');
  const outcomes = [];
  async function checkPracticeStep(step, expected) {
    assert.equal(await practice.getAttribute('data-practice-step'), String(step));
    const actual = await practice.locator('.access-practice-decision').evaluateAll(rows => rows.map(row => ({ actor: row.getAttribute('data-actor'), resource: row.getAttribute('data-resource'), allow: row.getAttribute('data-allowed') === 'true' })));
    assert.deepEqual(actual, expected, `Practice step ${step} decisions`); outcomes.push({ step, actual });
    await unchanged(page, practiceBaseline, `Practice step ${step} changed the live mission or progression`);
  }
  const vaultDecision = (actor, allow) => ({ actor, resource: 'vault-gate', allow });
  await checkPracticeStep(0, [vaultDecision('player', false)]);
  await keyboardActivate(page, practice.getByRole('button', { name: /Borrow the Vault key/ }));
  await checkPracticeStep(1, [vaultDecision('player', true)]);
  await keyboardActivate(page, practice.getByRole('button', { name: /Make a training copy/ }));
  await checkPracticeStep(2, [vaultDecision('player', true), vaultDecision('copied-holder', true)]);
  await practice.scrollIntoViewIfNeeded();
  await capture(page, '03-copied-access-practice-1280', '.learning-panel');
  const beginBounds = await page.getByRole('button', { name: 'Begin mission', exact: false }).boundingBox();
  assert(beginBounds && beginBounds.y >= 0 && beginBounds.y + beginBounds.height <= 800, 'Begin mission disappeared below the practice at laptop size');
  await page.setViewportSize({ width: 1920, height: 1080 });
  await keyboardActivate(page, practice.getByRole('button', { name: /Lock down Vault/ }));
  await checkPracticeStep(3, [vaultDecision('player', false), vaultDecision('copied-holder', false)]);
  await capture(page, '04-revocation-practice-1920', '.learning-panel');
  await keyboardActivate(page, practice.getByRole('button', { name: /Test the ordinary exit/ }));
  await checkPracticeStep(4, [vaultDecision('player', false), vaultDecision('copied-holder', false), { actor: 'player', resource: 'ordinary-exit', allow: true }]);
  await keyboardActivate(page, practice.getByRole('button', { name: /Replay exercise/ }));
  await checkPracticeStep(0, [vaultDecision('player', false)]);
  await keyboardActivate(page, practice.getByRole('button', { name: /Borrow the Vault key/ }));
  await keyboardActivate(page, practice.getByRole('button', { name: 'Reset', exact: true }));
  await checkPracticeStep(0, [vaultDecision('player', false)]);
  assert.equal(receipt.commands.length, commandCount, 'Practice sent a live command');
  await focusWrap(page, '.learning-panel');
  record('Practice is manual, shows real permission outcomes, replays and resets without changing server state or progression', { outcomes, noLiveCommands: true, keyboardFocusWrapped: true, beginVisibleAt1280: true });

  await keyboardActivate(page, page.getByRole('button', { name: 'Begin mission', exact: false }));
  await page.locator('.campaign-layer').waitFor({ state: 'hidden' });
  const started = await until(page, s => s.status === 'playing', 'Begin did not start the mission');
  assert.equal(started.levelId, 1); assert.deepEqual(started.player, { x: 1, z: 11 });
  await pressCommand(page, 'd');
  const moved = await until(page, s => s.player.x >= 3, 'Steering did not reach the first key');
  await pressCommand(page, 'Space');
  const braked = await state(page); await page.waitForTimeout(800); const afterBrake = await state(page);
  assert.deepEqual(afterBrake.player, braked.player, 'Space did not brake the player');
  assert(afterBrake.elapsedMs > braked.elapsedMs, 'Space incorrectly paused simulation time');
  assert.notDeepEqual(afterBrake.sentries, braked.sentries, 'Sentries stopped with Space');
  assert(afterBrake.grants.some(grant => grant.id === 'vault'), 'Real movement did not collect the key');
  await capture(page, '05-live-learning-note-1920', 'main');
  await page.setViewportSize({ width: 1280, height: 800 }); await capture(page, '06-live-learning-note-1280', 'main');
  record('Explicit Begin enables real movement; Space stops the player while sentries and credential time continue', { started: simulation(started), firstKeyPosition: moved.player, braked: simulation(braked), afterBrake: simulation(afterBrake) });

  await pressCommand(page, 'Escape'); await page.getByRole('heading', { name: 'Ghost on standby.', exact: true }).waitFor();
  const frozen = await snapshot(page);
  await keyboardActivate(page, page.locator('.field-guide > summary'));
  await page.locator('.field-guide-content').waitFor();
  await page.locator('.field-guide dt').filter({ hasText: /^Credential$/ }).scrollIntoViewIfNeeded();
  await capture(page, '07-paused-field-guide-1280', '.modal-card');
  await page.waitForTimeout(1500); await unchanged(page, frozen, 'Field guide reading advanced the paused simulation');
  await focusWrap(page, '.modal-card');
  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.locator('.field-guide dt').filter({ hasText: /^Revocation$/ }).scrollIntoViewIfNeeded();
  await capture(page, '08-paused-field-guide-1920', '.modal-card');
  await unchanged(page, frozen, 'Field guide navigation advanced the paused simulation');
  await keyboardActivate(page, page.locator('.field-guide > summary'));
  await keyboardActivate(page, page.getByRole('button', { name: 'Resume heist', exact: false }));
  await until(page, s => s.status === 'playing' && s.elapsedMs > frozen.simulation.elapsedMs, 'Resume did not advance time');
  record('Pause field guide opens by keyboard, fits both viewports, traps focus and freezes player, enemies, grants and time', { frozen: frozen.simulation });

  const priorRun = (await state(page)).runId, savedProgress = await progress(page);
  await page.getByRole('button', { name: 'Restart level', exact: true }).click();
  await page.getByRole('heading', { name: 'Restart this sector?', exact: true }).waitFor();
  const beforeRestart = await snapshot(page); await page.waitForTimeout(450); await unchanged(page, beforeRestart, 'Restart confirmation failed to freeze the live run');
  await keyboardActivate(page, page.getByRole('button', { name: 'Restart heist', exact: true }));
  const restarted = await until(page, s => s.status === 'playing' && s.runId !== priorRun, 'Restart did not create a new live run');
  assert.deepEqual(restarted.player, { x: 1, z: 11 }); assert.deepEqual(restarted.grants, []); assert.equal(restarted.carrying, false); assert.equal(await progress(page), savedProgress, 'Restart changed campaign progress');
  await pressCommand(page, 'Escape');
  record('Visible Restart resets the attempt while preserving current stored progress', { restarted: simulation(restarted) });
  await context.close();

  const reducedRun = await newPage({ viewport: { width: 1280, height: 800 }, reducedMotion: 'reduce' }, 'reduced-motion');
  const reduced = reducedRun.page;
  await keyboardActivate(reduced, reduced.getByRole('button', { name: 'Begin operation', exact: true }));
  await reduced.locator('.showing-intro').waitFor(); const reducedBaseline = await snapshot(reduced);
  await reduced.waitForTimeout(4700);
  assert.equal(await reduced.locator('.intro-chapters [aria-current="step"]').getAttribute('aria-label'), 'Chapter 1: Your assignment');
  assert.equal(await reduced.locator('.intro-key').evaluate(el => getComputedStyle(el).animationName), 'none', 'Reduced-motion introduction still animates the key');
  await keyboardActivate(reduced, reduced.getByRole('button', { name: 'Chapter 3: A copied key', exact: true }));
  await capture(reduced, '09-reduced-motion-intro-1280', '.learning-panel');
  await keyboardActivate(reduced, reduced.getByRole('button', { name: 'Skip introduction', exact: false }));
  await reduced.getByRole('button', { name: 'Begin mission', exact: false }).waitFor();
  await unchanged(reduced, reducedBaseline, 'Reduced-motion navigation or Skip changed the live mission');
  assert.equal(await reduced.locator('[data-practice-mode="borrowed"]').getAttribute('data-practice-step'), '0');
  await reduced.keyboard.press('Escape'); await reduced.getByRole('button', { name: 'Begin operation', exact: true }).waitFor();
  assert.equal((await state(reduced)).status, 'title');
  record('Reduced-motion intro remains manual, has no key animation, supports Skip and returns safely to title');
  await reducedRun.context.close();
  assert.deepEqual(receipt.errors, []);
  receipt.passed = true;
} catch (error) {
  receipt.passed = false; receipt.failure = { message: error.message, stack: error.stack };
  if (activePage && !activePage.isClosed()) {
    await activePage.screenshot({ path: `${output}/verification-failure.png` }).catch(() => {});
    receipt.failure.state = await state(activePage).catch(() => null);
  }
  throw error;
} finally {
  receipt.finishedAt = new Date().toISOString();
  await fs.writeFile(`${output}/newcomer-verification.json`, JSON.stringify(receipt, null, 2) + '\n');
  await browser.close();
}
console.log(JSON.stringify({ passed: receipt.passed, checks: receipt.checks.length, screenshots: receipt.screenshots.length, errors: receipt.errors, output }));
