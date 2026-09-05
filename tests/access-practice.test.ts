import test from 'node:test';
import assert from 'node:assert/strict';
import {
  advancePractice, createPractice, evaluatePracticeAccess, PRACTICE_DURATION_MS,
} from '../shared/access-practice.js';

test('borrowed exercise demonstrates missing, shared and revoked Vault access before a baseline exit', () => {
  const missing = createPractice('borrowed');
  assert.equal(missing.decisions[0].allow, false);
  assert.equal(missing.decisions[0].reason, 'no credential');

  const borrowed = advancePractice(missing);
  assert.equal(borrowed.decisions[0].allow, true);
  assert.equal(evaluatePracticeAccess(borrowed, 'copied-holder', 'vault-gate').allow, false);

  const copied = advancePractice(borrowed);
  assert.deepEqual(copied.decisions.map(decision => decision.allow), [true, true]);
  assert.deepEqual(copied.decisions.map(decision => decision.grant), ['vault', 'vault']);

  const revoked = advancePractice(copied);
  assert.deepEqual(revoked.decisions.map(decision => decision.reason), ['role revoked', 'role revoked']);

  const exit = advancePractice(revoked);
  const baseline = exit.decisions.find(decision => decision.resource === 'ordinary-exit')!;
  assert.equal(baseline.actor, 'player');
  assert.equal(baseline.allow, true);
  assert.equal(baseline.grant, null);
  assert.equal(baseline.reason, 'baseline permission');
  assert.equal(evaluatePracticeAccess(exit, 'copied-holder', 'ordinary-exit').allow, false);
  assert.deepEqual(advancePractice(exit), exit, 'finished exercise never silently restarts');
});

test('expiry occurs at the exact end time and renewal restores both holders of the same grant', () => {
  const active = createPractice('expiry');
  assert.deepEqual(active.decisions.map(decision => decision.allow), [true, true]);
  const justBefore = { ...active, context: { ...active.context, elapsedMs: PRACTICE_DURATION_MS - 1 } };
  for (const actor of ['player', 'copied-holder'] as const) {
    assert.equal(evaluatePracticeAccess(justBefore, actor, 'vault-gate').allow, true);
  }
  const expired = advancePractice(active);
  assert.equal(expired.context.elapsedMs, PRACTICE_DURATION_MS);
  assert.deepEqual(expired.decisions.map(decision => decision.reason), ['grant expired', 'grant expired']);

  const renewed = advancePractice(expired);
  assert.equal(renewed.context.elapsedMs, expired.context.elapsedMs);
  assert.equal(renewed.context.grants[0].expiresAt, 2 * PRACTICE_DURATION_MS);
  assert.equal(renewed.context.grants[0].id, 'vault');
  assert.deepEqual(renewed.context.holders, expired.context.holders, 'renewal does not remove the copy');
  assert.deepEqual(renewed.decisions.map(decision => decision.allow), [true, true]);
  assert.equal(expired.context.grants[0].expiresAt, PRACTICE_DURATION_MS, 'previous step stays immutable');
});

test('Vault lockdown removes both holders Vault access while leaving the separate Transit grant untouched', () => {
  const active = createPractice('scopes');
  const transitBefore = structuredClone(active.context.grants.find(grant => grant.id === 'transit'));
  assert.deepEqual(active.decisions.map(decision => decision.allow), [true, true, true]);
  const locked = advancePractice(active);
  assert.deepEqual(locked.decisions.map(decision => decision.allow), [false, false, true]);
  assert.deepEqual(locked.context.grants.find(grant => grant.id === 'transit'), transitBefore);
  assert.equal(evaluatePracticeAccess(locked, 'player', 'vault-gate').reason, 'role revoked');
  assert.equal(evaluatePracticeAccess(locked, 'copied-holder', 'vault-gate').reason, 'role revoked');

  const exit = advancePractice(locked);
  assert.deepEqual(exit.decisions.map(decision => [decision.actor, decision.allow]), [['player', true], ['copied-holder', false]]);
  assert.equal(exit.decisions[0].grant, 'transit');
  assert.equal(exit.decisions[1].reason, 'no credential');
});

test('advancing and replaying use isolated nested state with no carryover between exercises', () => {
  const original = createPractice('borrowed');
  const snapshot = structuredClone(original);
  let completed = original;
  for (let step = 0; step < 4; step++) completed = advancePractice(completed);
  assert.deepEqual(original, snapshot);
  const replay = createPractice('borrowed');
  assert.deepEqual(replay, snapshot);
  replay.context.holders.player.push('transit');
  replay.context.grants[0].resources.push('unrelated-device');
  assert.deepEqual(original, snapshot, 'fresh runs share no holder or resource arrays');
  assert.deepEqual(createPractice('borrowed'), snapshot);
  assert.equal(createPractice('expiry').context.grants[0].revoked, false);
  assert.equal(createPractice('scopes').context.grants.find(grant => grant.id === 'transit')!.revoked, false);
});
