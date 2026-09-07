import test from 'node:test';
import assert from 'node:assert/strict';
import { updatePassiveNotice, expirePassiveNotice, type NoticeSnapshot } from '../src/passiveNotice';

const snapshot = (changes: Partial<NoticeSnapshot> = {}): NoticeSnapshot => ({
  runId: 'first-run', status: 'playing', elapsedMs: 1000,
  message: 'Vault key copied. Cross into cyan.', ...changes,
});

test('an automatic pickup notice expires despite unchanged messages in later movement updates', () => {
  const first = updatePassiveNotice(null, snapshot(), 100);
  assert.equal(first?.message, 'Vault key copied. Cross into cyan.');
  assert.notEqual(first?.expiresAt, null);
  const moving = updatePassiveNotice(first, snapshot({ elapsedMs: 4000 }), 3100);
  assert.equal(moving, first, 'Movement updates must not restart the notice clock');
  assert.equal(expirePassiveNotice(moving, 3599), first);
  const expired = expirePassiveNotice(moving, 3600);
  assert.equal(expired?.expiresAt, null);
  assert.equal(updatePassiveNotice(expired, snapshot({ elapsedMs: 6000 }), 5100), expired,
    'The persistent server message must not reappear after expiry');
});

test('a genuinely new message replaces the old notice and receives its own lifetime', () => {
  const first = updatePassiveNotice(null, snapshot(), 100);
  const next = updatePassiveNotice(first, snapshot({ message: 'Vault access withdrawn.' }), 3000);
  assert.equal(next?.message, 'Vault access withdrawn.');
  assert.notEqual(expirePassiveNotice(next, 3600)?.expiresAt, null);
  assert.equal(expirePassiveNotice(next, 6500)?.expiresAt, null);
});

test('pause clears a notice without resurrecting the same message on resume', () => {
  const first = updatePassiveNotice(null, snapshot(), 100);
  const paused = updatePassiveNotice(first, snapshot({ status: 'paused' }), 400);
  assert.equal(paused?.expiresAt, null);
  const resumed = updatePassiveNotice(paused, snapshot(), 700);
  assert.equal(resumed?.expiresAt, null);
});

test('title and restarted attempts clear the prior message, but a later pickup can appear again', () => {
  const first = updatePassiveNotice(null, snapshot(), 100);
  assert.equal(updatePassiveNotice(first, snapshot({ status: 'title', elapsedMs: 0 }), 200)?.expiresAt, null);
  const restarted = updatePassiveNotice(first, snapshot({ runId: 'second-run', elapsedMs: 0, message: 'New attempt.' }), 300);
  assert.equal(restarted?.expiresAt, null);
  assert.equal(updatePassiveNotice(restarted, snapshot({ runId: 'second-run', message: 'New attempt.' }), 500)?.expiresAt, null);
  const pickup = updatePassiveNotice(restarted, snapshot({ runId: 'second-run' }), 900);
  assert.equal(pickup?.message, 'Vault key copied. Cross into cyan.');
  assert.notEqual(pickup?.expiresAt, null);
});

test('blank and finished-game messages cannot leave a passive overlay visible', () => {
  const first = updatePassiveNotice(null, snapshot(), 100);
  for (const changes of [{ message: '' }, { status: 'won' as const }, { status: 'lost' as const }]) {
    assert.equal(updatePassiveNotice(first, snapshot(changes), 200)?.expiresAt, null);
  }
});
