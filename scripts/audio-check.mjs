import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
const output = process.env.GHOST_PROTOCOL_CAPTURE_DIR || 'captures/clearer-devices';
const headed = process.env.GHOST_PROTOCOL_AUDIO_HEADED === '1';
await fs.mkdir(output, { recursive: true });
const browser = await chromium.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: !headed, args: ['--use-gl=angle', '--use-angle=metal'] });
const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
await context.addInitScript(() => {
  const original = AudioContext.prototype.createBufferSource;
  window.audioLoopAudit = { created: 0, started: 0, active: [], buffers: [] };
  AudioContext.prototype.createBufferSource = function (...args) {
    const source = original.apply(this, args);
    const id = ++window.audioLoopAudit.created;
    const start = source.start;
    source.start = function (...startArgs) {
      const result = start.apply(this, startArgs);
      window.audioLoopAudit.started++;
      window.audioLoopAudit.active.push(id);
      window.audioLoopAudit.buffers.push({ duration: this.buffer?.duration, length: this.buffer?.length, sampleRate: this.buffer?.sampleRate, loop: this.loop, loopEnd: this.loopEnd });
      return result;
    };
    source.addEventListener('ended', () => { window.audioLoopAudit.active = window.audioLoopAudit.active.filter(item => item !== id); });
    return source;
  };
});
const page = await context.newPage();
page.setDefaultTimeout(6000);
const errors = [], musicRequests = [];
page.on('pageerror', error => errors.push(error.message));
page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
page.on('request', request => { if (request.url().includes('/audio/neon-run.mp3')) musicRequests.push(request.url()); });
const state = () => page.evaluate(async () => await (await fetch('/api/state')).json());
const diagnostics = () => page.evaluate(() => window.ghostProtocolAudioDiagnostics());
const audit = () => page.evaluate(() => window.audioLoopAudit);
const measure = ms => page.evaluate(duration => window.sampleMusic(duration), ms);
const ensurePaused = async () => {
  if ((await state()).status === 'playing') await page.keyboard.press('Escape');
  await page.getByRole('heading', { name: 'Ghost on standby.', exact: true }).waitFor();
};
const resume = async () => {
  await page.getByRole('button', { name: 'Resume heist', exact: true }).click();
  await page.waitForFunction(() => window.ghostProtocolAudioDiagnostics()?.playing === true);
};
try {
  await page.goto(process.env.GHOST_PROTOCOL_BASE || 'http://127.0.0.1:5320');
  assert.equal(musicRequests.length, 0, 'The title must not download music before an audio gesture');
  await page.getByRole('button', { name: 'Begin operation', exact: true }).click();
  await page.getByRole('button', { name: 'Skip introduction', exact: true }).click();
  await page.getByRole('button', { name: 'Begin mission', exact: true }).click();
  await page.getByRole('complementary', { name: 'Current objective', exact: true }).waitFor();
  await page.waitForFunction(() => window.ghostProtocolAudioDiagnostics()?.loadState === 'ready');
  await page.evaluate(async () => {
    const ctx = new AudioContext(); await ctx.resume();
    const source = ctx.createMediaStreamSource(window.ghostProtocolAudioStream);
    const analyser = ctx.createAnalyser(); analyser.fftSize = 2048; source.connect(analyser);
    window.audioProbe = { ctx, analyser };
    window.sampleMusic = async (ms = 1400) => {
      const values = [], end = performance.now() + ms, wave = new Float32Array(2048);
      while (performance.now() < end) {
        analyser.getFloatTimeDomainData(wave);
        values.push(Math.sqrt(wave.reduce((sum, x) => sum + x * x, 0) / wave.length));
        await new Promise(resolve => setTimeout(resolve, 40));
      }
      return { rms: Math.sqrt(values.reduce((sum, x) => sum + x * x, 0) / values.length), peakRms: Math.max(...values), frames: values.length };
    };
  });
  await page.waitForTimeout(1400);
  const idle = await measure();
  assert.equal((await diagnostics()).activeSources, 1);
  assert.equal((await diagnostics()).activeSchedulers, 0);
  assert(idle.rms > .001, `No audible music while idle: ${idle.rms}`);
  const loopBefore = await diagnostics(), loopStart = performance.now();
  const completeLoop = await measure(33500);
  const loopElapsedSeconds = (performance.now() - loopStart) / 1000, loopAfter = await diagnostics(), loopAudit = await audit();
  assert(completeLoop.rms > .001, 'Music must remain audible through a complete loop');
  assert.equal(loopAudit.started, 1, 'The audio clock loops one source without creating a second');
  assert.equal(loopAudit.active.length, 1);
  assert.equal(musicRequests.length, 1, 'Looping must not download the song again');
  assert(Math.abs(loopAudit.buffers[0].duration - 30.96775) < .0001, 'Browser decoding must preserve the complete gapless loop');
  assert(Math.abs(loopAfter.positionSeconds - (loopBefore.positionSeconds + loopElapsedSeconds) % loopAfter.loopSeconds) < .25);
  assert.equal((await state()).turn, 0);
  await fs.writeFile(output + '/audio-loop-verification.json', JSON.stringify({ completeLoop, loopElapsedSeconds, loopBefore, loopAfter, loopAudit, musicRequests: musicRequests.length, errors }, null, 2) + '\n');
  console.log('Complete loop passed: one request, one source, audible for over thirty-three seconds.');

  await ensurePaused(); await page.waitForTimeout(500);
  const paused = await measure(), pausePosition = (await diagnostics()).positionSeconds;
  assert.equal((await diagnostics()).activeSources, 0);
  assert.equal((await audit()).active.length, 0, 'The faded source must release its graph');
  assert(paused.rms < .0001, `Pause left audio running: ${paused.rms}`);
  assert.equal((await state()).turn, 0);
  const effects = page.getByRole('button', { name: 'Sound effects', exact: true }), music = page.getByRole('button', { name: 'Music', exact: true });
  await effects.click(); await music.click();
  assert.equal(await effects.getAttribute('aria-pressed'), 'false');
  assert.equal(await music.getAttribute('aria-pressed'), 'false');
  const volume = page.getByRole('slider', { name: 'Music volume', exact: true });
  await volume.press('Home'); for (let i = 0; i < 6; i++) await volume.press('ArrowRight');
  assert.equal(await volume.inputValue(), '30');
  await page.screenshot({ path: output + '/sound-controls.png' });
  await page.keyboard.press('Escape'); await page.waitForTimeout(800);
  assert.equal((await state()).status, 'playing', 'Escape resumes even when the volume slider has focus');
  const mutedMusic = await measure(); assert(mutedMusic.rms < .0001);
  await ensurePaused(); await music.click(); await resume(); await page.waitForTimeout(1000);
  const musicOnly = await measure(); assert(musicOnly.rms > .0004, 'Music works with effects disabled');
  assert((await diagnostics()).positionSeconds > pausePosition, 'Music resumes from its saved position');
  await page.getByRole('button', { name: 'Mute audio', exact: true }).click(); await page.waitForTimeout(500);
  const masterMuted = await measure(); assert(masterMuted.rms < .0001);
  assert.equal((await audit()).active.length, 0);
  await page.getByRole('button', { name: 'Enable audio', exact: true }).click(); await page.waitForTimeout(1000);
  const resumed = await measure(); assert(resumed.rms > .0004);

  let hiddenTab = { tested: false, reason: 'Run with GHOST_PROTOCOL_AUDIO_HEADED=1 to test actual tab visibility' };
  if (headed) {
    const other = await context.newPage(); await other.goto('about:blank'); await other.bringToFront();
    const becameHidden = await page.waitForFunction(() => document.visibilityState === 'hidden', null, { timeout: 3000 }).then(() => true).catch(() => false);
    if (becameHidden) {
      await page.waitForTimeout(350);
      const before = await diagnostics(); await page.waitForTimeout(1100); const after = await diagnostics();
      assert.equal(before.activeSources, 0); assert.equal(after.activeSources, 0);
      assert.equal(before.positionSeconds, after.positionSeconds, 'Hidden tabs retain the paused music position');
      assert.equal((await audit()).active.length, 0);
      await page.bringToFront(); await other.close();
      await ensurePaused(); await resume(); await page.waitForTimeout(650);
      assert.equal((await audit()).active.length, 1);
      hiddenTab = { tested: true, visibility: 'hidden', before, after, resumedSources: (await audit()).active.length };
    } else {
      hiddenTab = { tested: false, reason: 'Headed automation kept both tabs visible; no actual hidden state was observed', observedVisibility: await page.evaluate(() => document.visibilityState) };
      await page.bringToFront(); await other.close();
    }
  }
  await page.locator('canvas').click({ position: { x: 400, y: 300 } });
  for (let i = 0; i < 8; i++) { await page.keyboard.press('e'); await page.waitForTimeout(220); }
  assert.equal((await state()).turn, 0);
  const afterUnlocks = await measure(), afterUnlockDiagnostics = await diagnostics();
  assert.equal(afterUnlockDiagnostics.activeSources, 1); assert.equal((await audit()).active.length, 1);
  assert.equal(afterUnlockDiagnostics.activeSchedulers, 0); assert(afterUnlocks.rms < .15);
  assert.equal(musicRequests.length, 1);

  // Hear a real named interaction with the song muted, using keyboard movement
  // and the existing E action rather than invoking an audio cue directly.
  await ensurePaused(); await music.click(); await effects.click(); await resume();
  await page.keyboard.press('ArrowRight');
  const movementDeadline = performance.now() + 3000;
  while ((await state()).player.x !== 2 && performance.now() < movementDeadline) await page.waitForTimeout(15);
  assert.equal((await state()).player.x, 2, 'Move beside the Vault key before braking');
  await page.keyboard.press('Space'); await page.waitForTimeout(400);
  await page.getByRole('button', { name: 'E Collect Vault key', exact: true }).first().waitFor();
  const interactionMeasurement = measure(1500); await page.keyboard.press('e');
  const interactionEffect = await interactionMeasurement;
  assert((await state()).grants.some(grant => grant.id === 'vault'));
  assert(interactionEffect.peakRms > .002, 'Collecting the Vault key must still produce its original sound effect');
  assert.equal((await diagnostics()).activeSources, 0, 'Only the interaction effect is audible in this check');
  await ensurePaused(); await effects.click(); await music.click();
  assert.equal(await volume.inputValue(), '30');
  await page.reload(); await page.getByRole('complementary', { name: 'Current objective', exact: true }).waitFor();
  await ensurePaused();
  assert.equal(await volume.inputValue(), '30');
  assert.equal(await effects.getAttribute('aria-pressed'), 'false');
  assert.equal(await music.getAttribute('aria-pressed'), 'true');
  assert.deepEqual(errors, []);
  const result = { browser: await browser.version(), idle, completeLoop, loopElapsedSeconds, loopBefore, loopAfter, loopAudit, paused, mutedMusic, musicOnly, masterMuted, resumed, hiddenTab, afterUnlocks, afterUnlockDiagnostics, interactionEffect, musicRequestsBeforeReload: 1, settingsPersisted: true, turnStayedZeroBeforeEffectCheck: true, errors };
  await fs.writeFile(output + '/audio-verification.json', JSON.stringify(result, null, 2) + '\n');
  console.log(JSON.stringify(result, null, 2));
} catch (error) {
  await page.screenshot({ path: output + '/audio-failure.png' }).catch(() => {});
  await fs.writeFile(output + '/audio-failure.json', JSON.stringify({ error: String(error), errors, musicRequests, diagnostics: await diagnostics().catch(() => null), state: await state().catch(() => null) }, null, 2) + '\n');
  throw error;
} finally { await browser.close(); }
