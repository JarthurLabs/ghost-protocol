import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';

// Run only after the host has been left idle. This script never prewarms or
// rewrites progress; an optional storage file must come from a real browser run.
const base = process.env.GHOST_PROTOCOL_BASE;
if (!base) throw Error('Set GHOST_PROTOCOL_BASE to the game URL.');
const origin = new URL(base).origin;
const output = path.resolve(process.env.GHOST_PROTOCOL_CAPTURE_DIR || '.runtime/hosting-startup-check');
const storageFile = process.env.GHOST_PROTOCOL_STORAGE_STATE;
const preIdleFile = process.env.GHOST_PROTOCOL_PRE_IDLE_STATE;
const progressKey = 'ghost-protocol-campaign-v1';
const idleSince = process.env.COLD_IDLE_SINCE;
let idleEvidence = { verified: false, reason: 'No local idle-start timestamp supplied.' };
if (idleSince) {
  const timestamp = Date.parse(idleSince), idleMs = Date.now() - timestamp;
  if (!Number.isFinite(timestamp) || !/^\d{4}-\d{2}-\d{2}T/.test(idleSince) || idleMs < 18 * 60_000) {
    throw Error('COLD_IDLE_SINCE must be an ISO timestamp at least 18 minutes in the past.');
  }
  idleEvidence = { verified: true, since: idleSince, elapsedMs: idleMs,
    scope: 'Local elapsed time only; this cannot prove that no other client contacted the host.' };
}
let storedProgress;
if (storageFile) {
  const saved = JSON.parse(await fs.readFile(storageFile, 'utf8'));
  const raw = saved.origins?.find(item => item.origin === origin)?.localStorage?.find(item => item.name === progressKey)?.value;
  if (raw !== undefined) storedProgress = JSON.parse(raw);
}
const preIdleState = preIdleFile ? JSON.parse(await fs.readFile(preIdleFile, 'utf8')) : undefined;
await fs.mkdir(output, { recursive: true });
const report = { base, startedAt: new Date().toISOString(), idleEvidence,
  storageStateProvided: Boolean(storageFile), progressSource: 'Existing browser storage only; no state or progress injection.',
  ...(preIdleState ? { preIdleState } : {}), measurements: [], browserErrors: [], resourceFailures: [], passed: false };
let browser, page, active, socketGeneration = 0;
const elapsed = run => Math.round((performance.now() - run.started) * 10) / 10;
const remaining = deadline => Math.max(1, Math.ceil(deadline - performance.now()));
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
async function until(predicate, deadline, label) {
  while (performance.now() < deadline) {
    const value = await predicate();
    if (value) return value;
    await sleep(Math.min(25, remaining(deadline)));
  }
  throw Error(`Timed out waiting for ${label}.`);
}
function browserError(kind, message, location, run = active) {
  report.browserErrors.push({ phase: run?.name ?? 'setup', scope: run?.gameObserved ? 'game-runtime' : 'startup',
    kind, message, ...(location ? { location } : {}) });
}
function observe(target) {
  target.on('pageerror', error => browserError('pageerror', error.message));
  target.on('console', message => {
    if (message.type() === 'error') browserError('console', message.text(), message.location());
  });
  target.on('response', response => {
    const run = active;
    if (!run) return;
    const request = response.request();
    if (response.status() >= 400) report.resourceFailures.push({ phase: run.name, scope: run.gameObserved ? 'game-runtime' : 'startup',
      atMs: elapsed(run), status: response.status(), type: request.resourceType(), url: response.url() });
    if (request.isNavigationRequest() && request.frame() === target.mainFrame()) {
      const item = { atMs: elapsed(run), status: response.status(), url: response.url() };
      run.documents.push(item);
      run.firstResponseMs ??= item.atMs;
    }
    if (request.resourceType() === 'script' && new URL(response.url()).origin === origin) {
      if (!run.bundleUrls.includes(response.url())) run.bundleUrls.push(response.url());
      if (response.ok() && new URL(response.url()).pathname.startsWith('/assets/')) run.gameObserved = true;
    }
  });
  target.on('websocket', socket => {
    if (new URL(socket.url()).pathname !== '/api/live') return;
    // Capture the owner now: old socket frames must never satisfy a warm reload.
    const run = active;
    if (!run) return;
    const record = { generation: ++socketGeneration, openedMs: elapsed(run), url: socket.url(), initialState: null, commands: [] };
    run.sockets.push(record);
    const sent = new Map();
    socket.on('socketerror', message => browserError('websocket', String(message), undefined, run));
    socket.on('framesent', ({ payload }) => {
      try {
        const frame = JSON.parse(String(payload));
        if (frame.kind !== 'command') return;
        const command = { id: frame.id, command: frame.command, sentMs: elapsed(run), sentAt: performance.now() };
        record.commands.push(command);
        sent.set(frame.id, command);
      } catch (error) { browserError('frame', error.message, undefined, run); }
    });
    socket.on('framereceived', ({ payload }) => {
      try {
        const frame = JSON.parse(String(payload));
        if (frame.kind === 'state' && !record.initialState) {
          assert.equal(frame.seq, 1, 'A new socket must begin with its own initial state.');
          record.initialState = frame.state;
          record.initialStateMs = elapsed(run);
          run.gameObserved = true;
        }
        if (frame.state) record.latestState = frame.state;
        const command = sent.get(frame.id);
        if (command && (frame.kind === 'ack' || frame.kind === 'error')) {
          command.ackMs = elapsed(run);
          command.roundTripMs = Math.round((performance.now() - command.sentAt) * 10) / 10;
          command.result = frame.kind;
          if (frame.error) command.error = frame.error;
          if (frame.state) command.state = { status: frame.state.status, levelId: frame.state.levelId, runId: frame.state.runId };
        }
      } catch (error) { browserError('frame', error.message, undefined, run); }
    });
  });
}
async function readProgress() {
  return page.evaluate(key => JSON.parse(localStorage.getItem(key)), progressKey);
}
async function captureFirstDocument(run, deadline) {
  if (run.documents.length !== 1 || run.gameObserved) return;
  const document = run.documents[0];
  try {
    const text = await page.locator('body').innerText({ timeout: Math.min(1500, remaining(deadline)) });
    if (run.documents.length !== 1 || run.gameObserved) return;
    if (document.status !== 503 && !/render|loading|starting|waking|spun down|spinning up/i.test(text)) return;
    run.interstitial = { observedMs: elapsed(run), status: document.status, url: page.url(), text: text.slice(0, 700),
      scope: 'First document before game readiness; status/text evidence does not alone prove an idle cold start.' };
    const start = performance.now();
    await page.screenshot({ path: path.join(output, `${run.name}-interstitial.png`), timeout: Math.min(5000, remaining(deadline)) });
    run.interstitial.screenshotMs = Math.round((performance.now() - start) * 10) / 10;
    run.interstitial.documentChangedDuringCapture = run.documents.length !== 1;
  } catch (error) { run.interstitialCaptureNotice = error.message; }
}
async function measure(name, reload, timeoutMs) {
  const run = { name, started: performance.now(), timeoutMs, documents: [], bundleUrls: [], sockets: [] };
  active = run;
  report.measurements.push(run);
  const deadline = run.started + timeoutMs;
  try {
    await (reload ? page.reload({ waitUntil: 'domcontentloaded', timeout: remaining(deadline) })
      : page.goto(base, { waitUntil: 'domcontentloaded', timeout: remaining(deadline) }));
  } catch (error) {
    // An interstitial can replace its own document before DOMContentLoaded.
    // Continue observing that navigation, without making a second request.
    if (!run.documents.length || !/ERR_ABORTED|interrupted by another navigation/i.test(error.message)) throw error;
    run.interstitialNavigationNotice = error.message;
  }
  const button = page.getByRole('button', { name: /^(Begin operation|Continue operation|Resume heist)$/ });
  const heading = page.getByRole('heading', { name: /^(A little ghost\.\s*A system to outsmart\.|Ghost on standby\.)$/ });
  await Promise.all([
    captureFirstDocument(run, deadline),
    (async () => {
      await heading.waitFor({ state: 'visible', timeout: remaining(deadline) });
      run.gameHeadingMs = elapsed(run);
      run.heading = await heading.innerText({ timeout: remaining(deadline) });
      run.readyScreen = run.heading.includes('Ghost on standby.') ? 'paused-run' : 'title';
      if (run.readyScreen === 'title') run.gameTitleMs = run.gameHeadingMs;
      run.gameObserved = true;
    })(),
    (async () => {
      await button.waitFor({ state: 'visible', timeout: remaining(deadline) });
      await until(() => button.isEnabled({ timeout: remaining(deadline) }), deadline, 'the enabled operation or resume button');
      run.enabledButtonMs = elapsed(run);
    })(),
    until(() => run.sockets.find(socket => socket.initialState), deadline, 'a fresh socket initial state'),
  ]);
  assert.equal(new URL(page.url()).origin, origin, 'Startup left the game origin.');
  const socket = run.sockets.at(-1);
  assert(socket?.initialState, 'The current socket has no initial state.');
  run.readyMs = elapsed(run);
  run.liveStateBeforeFirstCommand = socket.latestState;
  run.progressBeforeFirstCommand = await readProgress();
  if (name === 'cold' && storedProgress !== undefined) {
    assert.deepEqual(run.progressBeforeFirstCommand, storedProgress, 'Previously earned browser progress changed during startup.');
  }
  if (name === 'cold' && preIdleState) {
    if (preIdleState.progress !== undefined) assert.deepEqual(run.progressBeforeFirstCommand, preIdleState.progress, 'Pre-idle campaign progress changed.');
    run.attemptAfterIdle = { sameRunId: run.liveStateBeforeFirstCommand.runId === preIdleState.runId,
      before: { runId: preIdleState.runId, status: preIdleState.status, levelId: preIdleState.levelId },
      after: { runId: run.liveStateBeforeFirstCommand.runId, status: run.liveStateBeforeFirstCommand.status, levelId: run.liveStateBeforeFirstCommand.levelId },
      note: 'A host restart may reset an unfinished attempt. Earned browser progress is checked separately.' };
  }
  if (name === 'cold') {
    run.coldObservation = { status: 'unconfirmed', loadingPageObserved: Boolean(run.interstitial),
      reason: run.attemptAfterIdle?.sameRunId
        ? 'The pre-idle attempt survived. Another visitor may have kept the service awake; this is not a confirmed cold start.'
        : run.attemptAfterIdle
          ? 'The attempt reset after idle. This is consistent with a host restart but does not independently prove idle spin-down.'
          : 'No pre-idle attempt identity is available to establish whether the service restarted.' };
  }
  const screenshotStart = performance.now();
  await page.screenshot({ path: path.join(output, `${name}-ready.png`), timeout: remaining(deadline) });
  run.readyScreenshotMs = Math.round((performance.now() - screenshotStart) * 10) / 10;
  run.button = await button.innerText({ timeout: remaining(deadline) });
  const expectedCommand = run.button.trim() === 'Resume heist' ? 'resume' : 'select-level';
  const commandsBefore = socket.commands.length;
  run.clickMs = elapsed(run);
  await button.click({ timeout: remaining(deadline) });
  const first = await until(() => socket.commands[commandsBefore]?.result && socket.commands[commandsBefore], deadline, 'the clicked operation command acknowledgement');
  assert.equal(first.command.type, expectedCommand, 'The ready button sent an unexpected command.');
  assert.equal(first.result, 'ack', first.error ?? 'The first operation command was rejected.');
  assert.equal(socket.commands.length, commandsBefore + 1, 'The operation click sent multiple commands.');
  run.firstCommand = { id: first.id, type: first.command.type, sentMs: first.sentMs, ackMs: first.ackMs, roundTripMs: first.roundTripMs, state: first.state };
  if (expectedCommand === 'resume') {
    assert.equal(first.state?.status, 'playing', 'Resume was acknowledged without resuming the attempt.');
    await page.getByRole('button', { name: 'Resume heist', exact: true }).waitFor({ state: 'hidden', timeout: remaining(deadline) });
    const beforePause = socket.commands.length;
    await page.keyboard.press('Escape');
    const paused = await until(() => socket.commands[beforePause]?.result && socket.commands[beforePause], deadline, 'the real Escape pause acknowledgement');
    assert.equal(paused.command.type, 'pause', 'Escape did not send the expected pause command.');
    assert.equal(paused.result, 'ack', paused.error ?? 'The pause command was rejected.');
    assert.equal(paused.state?.status, 'paused', 'The resumed attempt did not return to a paused state.');
    assert.equal(socket.commands.length, beforePause + 1, 'Escape sent multiple commands.');
    run.pauseAfterResume = { id: paused.id, ackMs: paused.ackMs, roundTripMs: paused.roundTripMs, state: paused.state };
  }
  run.progressAfterFirstCommand = await readProgress();
  assert.deepEqual(run.progressAfterFirstCommand, run.progressBeforeFirstCommand, 'Startup interaction changed earned campaign progress.');
  run.completedMs = elapsed(run);
  return run;
}
try {
  browser = await chromium.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true,
    args: ['--use-gl=angle', '--use-angle=metal'] });
  report.browser = await browser.version();
  const context = await browser.newContext({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1,
    ...(storageFile ? { storageState: path.resolve(storageFile) } : {}) });
  page = await context.newPage();
  observe(page);
  const cold = await measure('cold', false, 150_000);
  const warm = await measure('warm', true, 15_000);
  assert.deepEqual(warm.progressBeforeFirstCommand, cold.progressAfterFirstCommand, 'Warm reload changed actual campaign progress.');
  assert.notEqual(warm.sockets.at(-1).generation, cold.sockets.at(-1).generation, 'Warm reload reused the old socket observation.');
  assert.deepEqual(report.browserErrors.filter(error => error.scope === 'game-runtime'), [], 'Game runtime browser errors occurred; inspect the saved receipt.');
  report.startupErrorsPreserved = report.browserErrors.filter(error => error.scope === 'startup').length;
  report.progressPreserved = true;
  report.passed = true;
} catch (error) {
  report.failure = error.message;
  process.exitCode = 1;
  if (page && !page.isClosed()) await page.screenshot({ path: path.join(output, 'startup-failure.png'), timeout: 5000 }).catch(() => {});
} finally {
  if (browser) await browser.close().catch(error => { report.closeError = error.message; report.passed = false; process.exitCode = 1; });
  report.finishedAt = new Date().toISOString();
  // Keep timing/state evidence compact; omit internal clocks and duplicate frames.
  for (const run of report.measurements) {
    delete run.started;
    for (const socket of run.sockets) {
      delete socket.latestState;
      for (const command of socket.commands) delete command.sentAt;
    }
  }
  await fs.writeFile(path.join(output, 'hosting-startup.json'), JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify({ passed: report.passed, output, failure: report.failure,
    measurements: report.measurements.map(run => ({ name: run.name, firstResponseMs: run.firstResponseMs, gameHeadingMs: run.gameHeadingMs,
      readyScreen: run.readyScreen, readyMs: run.readyMs, firstCommand: run.firstCommand, coldObservation: run.coldObservation })), browserErrors: report.browserErrors.length }));
}
