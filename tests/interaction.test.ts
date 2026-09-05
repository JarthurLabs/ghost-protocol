import test from 'node:test';
import assert from 'node:assert/strict';
import { advanceGame, applyCommand, authorize, createGame, snapshot, PLAYER_STEP_MS, type EngineState } from '../server/engine.js';
import { getLevel, LEVELS } from '../shared/level.js';
import type { LevelObject } from '../shared/campaign-schema.js';
import { offsets, same } from './maze-helpers.js';
import type { Direction } from '../shared/types.js';

function fixture(levelId = 4) {
  const game = createGame(levelId);
  applyCommand(game, { type: 'start' });
  return game;
}
function object(game: EngineState, type: LevelObject['type'], grantId?: string) {
  return getLevel(game.levelId).objects.find(item => item.type === type && (!grantId || item.grantId === grantId))!;
}
function use(game: EngineState, type: LevelObject['type'], grantId?: string) {
  const target = object(game, type, grantId);
  game.player = { x: target.x, z: target.z };
  return applyCommand(game, { type: 'interact' });
}
function zone(levelId: number, position: { x: number; z: number }) {
  return getLevel(levelId).tiles.find(tile => same(tile, position))?.zone;
}

test('interaction labels are absent on title and on ordinary floor', () => {
  const game = createGame();
  assert.equal(snapshot(game).interactionLabel, null);
  const started = applyCommand(game, { type: 'start' });
  assert.equal(started.contextObjectId, null);
  assert.equal(started.interactionLabel, null);
});

test('the advertised key target and label match the actual adjacent E pickup', () => {
  const game = fixture();
  for (const grantId of ['vault', 'transit']) {
    const key = object(game, 'terminal', grantId);
    game.player = { x: key.x - 1, z: key.z };
    assert.equal(zone(game.levelId, game.player), zone(game.levelId, key));
    const before = snapshot(game);
    assert.equal(before.contextObjectId, key.id);
    assert.equal(before.interactionLabel, `Collect ${grantId === 'vault' ? 'Vault' : 'Transit'} key`);
    const after = applyCommand(game, { type: 'interact' });
    assert.equal(after.decisions.at(-1)?.resource, before.contextObjectId);
    assert.equal(after.decisions.at(-1)?.action, 'borrow');
    assert.equal(after.decisions.at(-1)?.allow, true);
    assert.ok(after.grants.some(grant => grant.id === grantId));
    assert.equal(after.interactionLabel, null, 'a collected active key is no longer an E target');
  }
});

test('an expired key becomes collectible again at its exact deadline', () => {
  const game = fixture();
  use(game, 'terminal', 'vault');
  game.elapsedMs = game.grant!.expiresAt;
  const before = snapshot(game);
  assert.equal(before.interactionLabel, 'Collect Vault key');
  const after = applyCommand(game, { type: 'interact' });
  assert.equal(after.event, 'renewed');
  assert.equal(after.grant!.expiresAt, game.elapsedMs + getLevel(game.levelId).grants.find(grant => grant.id === 'vault')!.lifetimeMs);
  assert.equal(after.interactionLabel, null);
});

test('the package E label names the actual checked target even when expired access denies pickup', () => {
  const game = fixture();
  use(game, 'terminal', 'vault');
  game.elapsedMs = game.grant!.expiresAt;
  const item = object(game, 'package');
  game.player = { x: item.x, z: item.z };
  const before = snapshot(game);
  assert.equal(before.contextObjectId, item.id);
  assert.equal(before.interactionLabel, 'Pick up data package');
  const denied = applyCommand(game, { type: 'interact' });
  assert.equal(denied.carrying, false);
  assert.equal(denied.decisions.at(-1)?.resource, item.id);
  assert.equal(denied.decisions.at(-1)?.reason, 'grant expired');
  use(game, 'terminal', 'vault');
  const collected = use(game, 'package');
  assert.equal(collected.carrying, true);
  assert.equal(collected.interactionLabel, null);
});

test('no console can be advertised or used from the Vault side, including explicit paused revocation', () => {
  for (const level of LEVELS) {
    const game = fixture(level.id);
    use(game, 'terminal', 'vault');
    const gate = level.gates.find(item => item.id === 'gate-escape')!;
    game.player = { ...(zone(level.id, gate.a) === 'vault' ? gate.a : gate.b) };
    const before = snapshot(game);
    assert.equal(before.contextObjectId, null, `Mission ${level.id} must require crossing the gate first`);
    assert.equal(before.interactionLabel, null);
    const missed = applyCommand(game, { type: 'interact' });
    assert.equal(missed.event, 'interaction-missed');
    assert.equal(missed.grant!.revoked, false);
    applyCommand(game, { type: 'pause' });
    const denied = applyCommand(game, { type: 'revoke', grantId: 'vault' });
    assert.equal(denied.status, 'paused');
    assert.equal(denied.grant!.revoked, false);
    assert.match(denied.message, /escape area/i);
    assert.deepEqual(denied.decisions, before.decisions, 'unreachable console must not authorize a revoke');
  }
});

test('legitimate escape-side adjacency still permits lockdown in every mission', () => {
  for (const level of LEVELS) {
    const game = fixture(level.id);
    use(game, 'terminal', 'vault');
    const console = object(game, 'console');
    game.player = { x: console.x + 1, z: console.z };
    assert.equal(zone(level.id, game.player), 'escape');
    const before = snapshot(game);
    assert.equal(before.contextObjectId, console.id);
    assert.equal(before.interactionLabel, 'Lock Vault behind you');
    const after = applyCommand(game, { type: 'interact' });
    assert.equal(after.grant!.revoked, true);
    assert.equal(after.decisions.at(-1)?.resource, console.id);
  }
});

test('lockdown remains available for an expired Vault role, preserves Transit and clocks, then disappears', () => {
  const game = fixture();
  use(game, 'terminal', 'vault');
  use(game, 'terminal', 'transit');
  const console = object(game, 'console');
  game.player = { x: console.x, z: console.z };
  game.elapsedMs = game.grant!.expiresAt;
  game.direction = 'east'; game.queuedDirection = 'south'; game.playerClockMs = 90;
  const transit = structuredClone(game.grants.find(grant => grant.id === 'transit'));
  const clocks = structuredClone(game.sentryClocks);
  const before = snapshot(game);
  assert.equal(before.interactionLabel, 'Lock Vault behind you');
  assert.match(before.context!, /Transit unchanged/);
  const after = applyCommand(game, { type: 'interact' });
  assert.equal(after.status, 'playing');
  assert.equal(after.elapsedMs, before.elapsedMs);
  assert.equal(after.direction, 'east'); assert.equal(after.queuedDirection, 'south');
  assert.equal(game.playerClockMs, 90); assert.deepEqual(game.sentryClocks, clocks);
  assert.deepEqual(after.grants.find(grant => grant.id === 'transit'), transit);
  assert.equal(after.contextObjectId, null); assert.equal(after.interactionLabel, null);
  assert.equal(after.grant!.revoked, true);
  assert.equal(applyCommand(game, { type: 'interact' }).event, 'interaction-missed');
});

test('E on plain floor produces useful feedback without changing movement or permissions', () => {
  const game = fixture(1);
  game.direction = 'east'; game.queuedDirection = 'north'; game.playerClockMs = 30;
  const before = snapshot(game);
  const after = applyCommand(game, { type: 'interact' });
  assert.equal(after.event, 'interaction-missed');
  assert.equal(after.eventId, before.eventId + 1);
  assert.match(after.message, /nearby|within reach/i);
  assert.match(after.message, /automatic/i);
  for (const field of ['player', 'direction', 'queuedDirection', 'elapsedMs', 'grants', 'decisions'] as const) assert.deepEqual(after[field], before[field]);
  assert.equal(game.playerClockMs, 30);
});

test('named renewal labels match exact separate-role effects and copied Vault holders', () => {
  const game = fixture(5), level = getLevel(5);
  use(game, 'terminal', 'vault'); use(game, 'terminal', 'transit'); use(game, 'package');
  game.elapsedMs = 1000;
  for (const grant of game.grants) grant.expiresAt = game.elapsedMs;
  for (const grantId of ['vault', 'transit']) {
    const reader = object(game, 'renewal', grantId);
    game.player = { x: reader.x, z: reader.z };
    const before = snapshot(game), otherId = grantId === 'vault' ? 'transit' : 'vault';
    const other = structuredClone(before.grants.find(grant => grant.id === otherId));
    assert.equal(before.contextObjectId, reader.id);
    assert.equal(before.interactionLabel, `Renew ${grantId === 'vault' ? 'Vault' : 'Transit'} timer`);
    const after = applyCommand(game, { type: 'interact' });
    assert.equal(after.decisions.at(-1)?.resource, reader.id);
    assert.equal(after.grants.find(grant => grant.id === grantId)!.expiresAt, game.elapsedMs + level.grants.find(grant => grant.id === grantId)!.lifetimeMs);
    assert.deepEqual(after.grants.find(grant => grant.id === otherId), other);
    for (const sentry of game.sentries) {
      assert.equal(authorize(game, sentry.id, 'traverse', 'gate-escape').allow, true);
      assert.equal(authorize(game, sentry.id, 'traverse', 'gate-transit').allow, false);
    }
  }
});

test('crossing the Vault exit with the package tells the player to use the door switch', () => {
  const game = fixture(1), gate = getLevel(1).gates.find(item => item.id === 'gate-escape')!;
  use(game, 'terminal', 'vault'); use(game, 'package');
  const from = zone(1, gate.a) === 'vault' ? gate.a : gate.b, to = same(from, gate.a) ? gate.b : gate.a;
  game.player = { ...from };
  const direction = (Object.keys(offsets) as Direction[]).find(value => same({ x: from.x + offsets[value].x, z: from.z + offsets[value].z }, to))!;
  applyCommand(game, { type: 'move', direction });
  const after = advanceGame(game, PLAYER_STEP_MS);
  assert.deepEqual(after.player, to);
  assert.equal(after.message, 'VAULT EXIT CROSSED. Press E at the door switch to lock Vault behind you.');
  assert.equal(after.interactionLabel, 'Lock Vault behind you');
});
