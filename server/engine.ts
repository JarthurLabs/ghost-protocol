import { randomUUID } from 'node:crypto';
import { getLevel, LEVELS } from '../shared/level.js';
import type { LevelDefinition, LevelObject } from '../shared/campaign-schema.js';
import type { Command, Decision, DefenderPatch, DefenderState, Direction, GameState, Position, SentryState } from '../shared/types.js';
import { evaluateAccess, type AuthorizationPolicy } from './authorization.js';

export const PLAYER_STEP_MS = 180;
export const SENTRY_STEP_MS = 330;
export const EXTRACTION_MS = 2000;
export interface EngineState extends GameState {
  /** Holder assignments and scheduler fields are exclusively server-owned. */
  holders: Record<string, string[]>;
  playerClockMs: number;
  sentryClocks: Record<string, number>;
  patrolIndices: Record<string, number>;
  extractionHoldMs: number;
  expiredNotices: string[];
}
export class CommandError extends Error {}
const directions: Record<Direction, Position> = {
  north: { x: 0, z: -1 }, east: { x: 1, z: 0 }, south: { x: 0, z: 1 }, west: { x: -1, z: 0 },
};
const routePriority: Direction[] = ['east', 'south', 'west', 'north'];
const key = (p: Position) => `${p.x},${p.z}`;
const same = (a: Position, b: Position) => a.x === b.x && a.z === b.z;
const distance = (a: Position, b: Position) => Math.abs(a.x - b.x) + Math.abs(a.z - b.z);
const revokeForExtraction = 'Use Vault lockdown at the escape console: E closes the Vault gates before extraction.';
const worldCache = new Map<number, ReturnType<typeof makeWorld>>();
function makeWorld(level: LevelDefinition) {
  const actors = ['drone', ...level.sentries.map(sentry => sentry.id)];
  const baseline: AuthorizationPolicy['baseline'] = actors.flatMap(actor =>
    ['service', 'vault', 'escape'].map(zone => ({ actor, action: 'move', resource: `${zone}-floor` })));
  for (const object of level.objects) {
    if (object.type === 'terminal' || object.type === 'renewal') baseline.push({ actor: 'drone', action: 'borrow', resource: object.id });
    if (object.type === 'console') baseline.push({ actor: 'drone', action: 'revoke', resource: object.id });
    if (object.type === 'extraction' && !level.extractionGrantId) baseline.push({ actor: 'drone', action: 'extract', resource: object.id });
  }
  for (const gate of level.gates.filter(gate => gate.grantId === null)) {
    baseline.push(...actors.map(actor => ({ actor, action: 'traverse', resource: gate.id })));
  }
  const protectedRules: AuthorizationPolicy['protected'] = level.gates.filter(gate => gate.grantId !== null)
    .map(gate => ({ action: 'traverse', resource: gate.id, grantId: gate.grantId! }));
  for (const object of level.objects) {
    if (object.type === 'package') protectedRules.push({ action: 'collect', resource: object.id, grantId: level.compromisedGrantId });
    if (object.type === 'extraction' && level.extractionGrantId) protectedRules.push({ action: 'extract', resource: object.id, grantId: level.extractionGrantId });
  }
  return { level, tiles: new Map(level.tiles.map(tile => [key(tile), tile])), walls: new Set(level.walls.map(key)),
    shards: new Set(level.shards.map(key)), extraction: level.objects.find(object => object.type === 'extraction')!,
    policy: { actors, baseline, protected: protectedRules } };
}
function world(game: Pick<GameState, 'levelId'>) {
  if (!worldCache.has(game.levelId)) worldCache.set(game.levelId, makeWorld(getLevel(game.levelId)));
  return worldCache.get(game.levelId)!;
}
function syncAliases(game: EngineState) {
  game.grant = game.grants.find(grant => grant.id === world(game).level.compromisedGrantId) ?? null;
  const first = game.sentries[0]!;
  game.sentry = first.position; game.sentryMode = first.mode; game.sentryActive = game.sentries.length > 0;
}
function emit(game: EngineState, event: string, message?: string) {
  game.event = event; game.eventId++;
  if (message !== undefined) game.message = message;
}
export function createGame(levelId = 1): EngineState {
  if (!LEVELS.some(level => level.id === levelId)) throw new CommandError('Invalid command: unknown mission.');
  const level = getLevel(levelId);
  const sentries: SentryState[] = level.sentries.map(sentry => ({ id: sentry.id, name: sentry.name,
    position: { ...sentry.start }, mode: 'patrol', behavior: sentry.behavior, nextPosition: null }));
  return {
    runId: randomUUID(), levelId, status: 'title', turn: 0, elapsedMs: 0, player: { ...level.start },
    direction: null, queuedDirection: null, sentries, sentry: sentries[0]!.position,
    sentryActive: true, sentryMode: 'patrol', carrying: false, grant: null, grants: [],
    collectedShards: [], extractionProgress: 0, extractionTurns: 0,
    message: level.briefing, event: 'title', eventId: 0, decisions: [], nextSentry: null,
    context: null, contextObjectId: null, interactionLabel: null, defender: null,
    holders: Object.fromEntries(['drone', ...sentries.map(sentry => sentry.id)].map(id => [id, []])),
    playerClockMs: 0, sentryClocks: Object.fromEntries(sentries.map(sentry => [sentry.id, 0])),
    patrolIndices: Object.fromEntries(sentries.map(sentry => [sentry.id, 0])),
    extractionHoldMs: 0, expiredNotices: [],
  };
}
/** An explicit allowlist prevents server-only fields leaking into API responses. */
export function snapshot(game: EngineState): GameState {
  const visible = ['playing', 'paused'].includes(game.status) && !game.defender;
  const sentries = game.sentries.map(sentry => ({ ...sentry, nextPosition: visible ? predictedSentry(game, sentry) : null }));
  const object = visible ? nearby(game) : undefined;
  return structuredClone({
    runId: game.runId, levelId: game.levelId, status: game.status, turn: game.turn, elapsedMs: game.elapsedMs,
    player: game.player, direction: game.direction, queuedDirection: game.queuedDirection, sentries,
    sentry: sentries[0]!.position, sentryActive: game.sentryActive, sentryMode: sentries[0]!.mode,
    carrying: game.carrying, grant: game.grants.find(grant => grant.id === world(game).level.compromisedGrantId) ?? null,
    grants: game.grants, collectedShards: game.collectedShards,
    extractionProgress: game.extractionProgress, extractionTurns: game.extractionTurns,
    message: game.message, event: game.event, eventId: game.eventId, decisions: game.decisions,
    nextSentry: sentries[0]!.nextPosition, context: visible ? context(game, object) : null,
    contextObjectId: object?.id ?? null, interactionLabel: interactionLabel(game, object), defender: game.defender,
  });
}
function parseCommand(input: unknown): Command {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new CommandError('Invalid command.');
  const value = input as Record<string, unknown>, keys = Object.keys(value);
  if (keys.length === 2) {
    if (value.type === 'move' && typeof value.direction === 'string' && Object.hasOwn(directions, value.direction))
      return { type: 'move', direction: value.direction as Direction };
    if (value.type === 'select-level' && Number.isInteger(value.levelId) && LEVELS.some(level => level.id === value.levelId))
      return { type: 'select-level', levelId: value.levelId as number };
    if (value.type === 'revoke' && typeof value.grantId === 'string' && /^[a-z][a-z0-9-]{0,63}$/.test(value.grantId))
      return { type: 'revoke', grantId: value.grantId };
    if (value.type === 'defender-patch' && ['open', 'shutdown', 'least-privilege'].includes(value.patch as string))
      return { type: 'defender-patch', patch: value.patch as DefenderPatch };
  }
  if (keys.length === 1 && typeof value.type === 'string' && ['start', 'interact', 'wait', 'pause', 'resume', 'restart', 'defender-start'].includes(value.type))
    return { type: value.type } as Command;
  throw new CommandError('Invalid command. Only a known action and its required argument are accepted.');
}
export function applyCommand(game: EngineState, input: unknown): GameState {
  const command = parseCommand(input), draft = structuredClone(game);
  execute(draft, command); syncAliases(draft); Object.assign(game, draft);
  return snapshot(game);
}
function evaluateAuthorization(game: EngineState, actor: string, action: string, resource: string): Decision {
  // The legacy sentry name resolves to the first server identity; client commands cannot set it.
  const resolved = actor === 'sentry' ? game.sentries[0]!.id : actor;
  const result = evaluateAccess(world(game).policy, game, resolved, action, resource);
  return actor === 'sentry' ? { ...result, actor } : result;
}
export function authorize(game: EngineState, actor: string, action: string, resource: string): Decision {
  const decision = evaluateAuthorization(game, actor, action, resource);
  game.decisions.push(decision);
  if (game.decisions.length > 120) game.decisions.splice(0, game.decisions.length - 120);
  return decision;
}
function gateBetween(game: EngineState, a: Position, b: Position) {
  return world(game).level.gates.find(gate => (same(gate.a, a) && same(gate.b, b)) || (same(gate.a, b) && same(gate.b, a)));
}
function canStep(game: EngineState, a: Position, b: Position): boolean {
  const map = world(game);
  if (distance(a, b) !== 1 || map.walls.has(key(b))) return false;
  const from = map.tiles.get(key(a)), to = map.tiles.get(key(b));
  return Boolean(from && to && (from.zone === to.zone || gateBetween(game, a, b)));
}
function nextStep(game: EngineState, from: Position, target: Position): Position | null {
  if (same(from, target)) return null;
  const queue: { position: Position; first: Position | null }[] = [{ position: from, first: null }], visited = new Set([key(from)]);
  for (let index = 0; index < queue.length; index++) {
    const current = queue[index]!;
    for (const direction of routePriority) {
      const offset = directions[direction], next = { x: current.position.x + offset.x, z: current.position.z + offset.z };
      if (visited.has(key(next)) || !canStep(game, current.position, next)) continue;
      const first = current.first ?? next;
      if (same(next, target)) return first;
      visited.add(key(next)); queue.push({ position: next, first });
    }
  }
  return null;
}
function sentryTarget(game: EngineState, sentry: SentryState): Position {
  const definition = world(game).level.sentries.find(item => item.id === sentry.id)!;
  if (!game.carrying && definition.patrol.length) {
    let index = game.patrolIndices[sentry.id]! % definition.patrol.length;
    if (same(sentry.position, definition.patrol[index]!)) index = (index + 1) % definition.patrol.length;
    return definition.patrol[index]!;
  }
  if (sentry.behavior === 'ambusher' && game.direction && distance(sentry.position, game.player) > 3) {
    let target = game.player;
    for (let index = 0; index < 3; index++) {
      const offset = directions[game.direction], next = { x: target.x + offset.x, z: target.z + offset.z };
      if (!canStep(game, target, next)) break;
      target = next;
    }
    return target;
  }
  if (sentry.behavior === 'warden' && game.direction && distance(sentry.position, game.player) > 5) {
    let target = game.player;
    for (let index = 0; index < 2; index++) {
      const offset = directions[game.direction], next = { x: target.x - offset.x, z: target.z - offset.z };
      if (!canStep(game, target, next)) break;
      target = next;
    }
    return target;
  }
  return game.player;
}
function predictedSentry(game: EngineState, sentry: SentryState): Position | null {
  const next = nextStep(game, sentry.position, sentryTarget(game, sentry));
  if (!next) return null;
  const gate = gateBetween(game, sentry.position, next);
  return gate && !evaluateAuthorization(game, sentry.id, 'traverse', gate.id).allow ? { ...sentry.position } : next;
}
function availableObject(game: EngineState, object: LevelObject): boolean {
  const grant = game.grants.find(item => item.id === object.grantId);
  if (object.type === 'terminal') return !grant || grant.revoked || game.elapsedMs >= grant.expiresAt;
  if (object.type === 'renewal') return true;
  if (object.type === 'package') return !game.carrying;
  if (object.type === 'console') return game.grants.some(item => item.id === world(game).level.compromisedGrantId && !item.revoked);
  return false;
}
function reachableObject(game: EngineState, object: LevelObject): boolean {
  const map = world(game), from = map.tiles.get(key(game.player)), to = map.tiles.get(key(object));
  if (!from || !to || from.zone !== to.zone || map.walls.has(key(game.player)) || map.walls.has(key(object))) return false;
  return same(game.player, object) || canStep(game, game.player, object);
}
function nearby(game: EngineState): LevelObject | undefined {
  return world(game).level.objects.filter(object => reachableObject(game, object) && availableObject(game, object))
    .sort((a, b) => distance(game.player, a) - distance(game.player, b))[0];
}
function interactionLabel(game: EngineState, object?: LevelObject): string | null {
  if (!object) return null;
  const label = world(game).level.grants.find(grant => grant.id === object.grantId)?.label;
  if (object.type === 'terminal') return `Collect ${label} key`;
  if (object.type === 'renewal') return `Renew ${label} timer`;
  if (object.type === 'package') return 'Pick up data package';
  if (object.type === 'console') return 'Lock Vault behind you';
  return null;
}
function context(game: EngineState, object?: LevelObject): string | null {
  const level = world(game).level;
  const label = level.grants.find(grant => grant.id === object?.grantId)?.label ?? 'Access';
  if (object?.type === 'terminal') return `${label} key · Walk over to collect automatically`;
  if (object?.type === 'renewal') return object.grantId === level.compromisedGrantId
    ? `${label} renewal: restore the ${label} timer, including copied access · E`
    : `${label} renewal: restore only the ${label} timer · E`;
  if (object?.type === 'package') return 'Data package · Walk over to pick up';
  if (object?.type === 'console') return level.extractionGrantId
    ? 'Vault lockdown: close Vault gates; Transit unchanged · E'
    : 'Vault lockdown: close Vault gates; escape stays open · E';
  if (same(game.player, world(game).extraction)) {
    if (!game.carrying) return 'Find the golden data package';
    if (!game.grant?.revoked) return revokeForExtraction;
    const extraction = evaluateAuthorization(game, 'drone', 'extract', world(game).extraction.id);
    return extraction.allow ? 'Extraction pad · Stay here for two seconds' : `Transit access required: ${extraction.reason}. Collect the Transit key or use Transit renewal.`;
  }
  return null;
}

function capture(game: EngineState): boolean {
  const sentry = game.sentries.find(item => same(game.player, item.position));
  if (!sentry) return false;
  game.status = 'lost'; game.direction = null; game.queuedDirection = null;
  emit(game, 'captured', game.carrying
    ? `Caught by ${sentry.name}. Lockdown changes gate access; it does not disable a sentry. Keep clear of open patrol routes.`
    : `Caught by ${sentry.name} on patrol. Sentries can reach you before the key-copy event. Watch the corners and plan a clear route.`);
  return true;
}
function revoke(game: EngineState, grantId: string) {
  const grant = game.grants.find(item => item.id === grantId);
  if (!world(game).level.grants.some(item => item.id === grantId)) throw new CommandError('Invalid command: unknown role.');
  const console = world(game).level.objects.find(object => object.type === 'console' && reachableObject(game, object));
  if (!console) { emit(game, 'denied', 'Reach the Vault lockdown console in the escape area before revoking access.'); return; }
  if (!grant || grant.revoked) { emit(game, 'denied', 'That role is not active.'); return; }
  if (!authorize(game, 'drone', 'revoke', console.id).allow) return;
  grant.revoked = true;
  const compromised = grantId === world(game).level.compromisedGrantId;
  emit(game, 'revoked', compromised
    ? `VAULT LOCKDOWN ACTIVE. Vault gates closed for you and the pursuers. ${world(game).level.extractionGrantId ? 'Transit access is unchanged. Continue through the Transit gate to extraction.' : 'The escape path stays open. Continue to extraction.'}`
    : `${grant.label.toUpperCase()} REVOKED. This was your escape role. Restore it at the nearby Transit terminal, then revoke Vault.`);
}
function interactObject(game: EngineState, object: LevelObject) {
  const level = world(game).level;
  if (object.type === 'terminal' || object.type === 'renewal') {
    if (!authorize(game, 'drone', 'borrow', object.id).allow) return;
    const definition = level.grants.find(grant => grant.id === object.grantId)!;
    const existing = game.grants.find(grant => grant.id === definition.id);
    const grant = { id: definition.id, label: definition.label, expiresAt: game.elapsedMs + definition.lifetimeMs,
      revoked: false, resources: [...definition.resources] };
    if (existing) Object.assign(existing, grant); else game.grants.push(grant);
    if (!game.holders.drone!.includes(grant.id)) game.holders.drone!.push(grant.id);
    if (game.carrying) for (const sentry of level.sentries) {
      if (sentry.copiedGrantId === grant.id && !game.holders[sentry.id]!.includes(grant.id)) game.holders[sentry.id]!.push(grant.id);
    }
    game.expiredNotices = game.expiredNotices.filter(id => id !== grant.id);
    syncAliases(game);
    emit(game, existing ? 'renewed' : 'borrowed', existing
      ? `${grant.label.toUpperCase()} ${object.type === 'renewal' ? 'RENEWAL' : 'KEY RESTORED'}. ${grant.label} timer restored${game.carrying && grant.id === level.compromisedGrantId ? ', including the pursuers’ copied Vault access' : grant.id !== level.compromisedGrantId ? '; only Transit access changed' : ''}.`
      : `${grant.label.toUpperCase()} KEY COLLECTED. Walk-over pickup is automatic. ${grant.id === level.compromisedGrantId ? 'Vault gates now accept your Vault key.' : 'The Transit gate and extraction now accept your Transit key; Vault access is unchanged.'}`);
  } else if (object.type === 'package') {
    const decision = authorize(game, 'drone', 'collect', object.id);
    if (!decision.allow) { emit(game, 'denied', `ACCESS DENIED — ${decision.reason}. Find or renew Vault access.`); return; }
    game.carrying = true;
    for (const sentry of game.sentries) {
      const definition = level.sentries.find(item => item.id === sentry.id)!;
      if (game.holders.drone!.includes(definition.copiedGrantId)) game.holders[sentry.id] = [definition.copiedGrantId];
      sentry.mode = 'chase';
    }
    emit(game, 'pickup', 'LAB ALERT: Vault key copied. Cross into cyan, then press E at Vault lockdown.');
  } else if (object.type === 'console') {
    revoke(game, level.compromisedGrantId);
  }
}
function gateMessage(game: EngineState, gate: LevelDefinition['gates'][number], decision: Decision): string {
  const label = world(game).level.grants.find(grant => grant.id === gate.grantId)?.label;
  const gateName = `${gate.label.toLowerCase()} gate`;
  if (decision.allow) return label
    ? `ACCESS GRANTED — ${label} key accepted at the ${gateName}.`
    : `MAINTENANCE DETOUR — The ${gateName} needs no key.`;
  const action = decision.reason === 'no credential'
    ? `Walk over the ${label} key to collect it automatically.`
    : decision.reason === 'grant expired'
      ? `Restore the ${label} timer at ${label} renewal, or collect the ${label} key again.`
      : decision.reason === 'role revoked'
        ? `${label === 'Vault' ? 'Vault lockdown is active. Use the open escape path, or collect the Vault key again to reopen its gates.' : 'Collect the Transit key or use Transit renewal to restore your escape access.'}`
        : `This key does not permit the ${gateName}. Find the matching ${label} key.`;
  return `ACCESS DENIED — ${label} access at the ${gateName}: ${decision.reason}. ${action}`;
}
function playerStep(game: EngineState) {
  const targetFor = (direction: Direction) => ({ x: game.player.x + directions[direction].x, z: game.player.z + directions[direction].z });
  if (game.queuedDirection && canStep(game, game.player, targetFor(game.queuedDirection))) {
    game.direction = game.queuedDirection; game.queuedDirection = null;
  }
  if (!game.direction) return;
  const target = targetFor(game.direction);
  if (!canStep(game, game.player, target)) { game.direction = null; return; }
  const gate = gateBetween(game, game.player, target), zone = world(game).tiles.get(key(target))!.zone;
  const decision = authorize(game, 'drone', gate ? 'traverse' : 'move', gate?.id ?? `${zone}-floor`);
  if (!decision.allow) { game.direction = null; emit(game, 'denied', gate ? gateMessage(game, gate, decision) : `ACCESS DENIED — ${decision.reason}.`); return; }
  game.player = target; game.turn++;
  const crossedVaultExit = gate?.grantId === world(game).level.compromisedGrantId && zone === 'escape' && game.carrying && !game.grant?.revoked;
  emit(game, gate ? 'gate' : 'move', crossedVaultExit
    ? 'VAULT EXIT CROSSED. Press E at the door switch to lock Vault behind you.'
    : gate ? gateMessage(game, gate, decision) : undefined);
  if (capture(game)) return;
  if (world(game).shards.has(key(target)) && !game.collectedShards.includes(key(target))) game.collectedShards.push(key(target));
  const pickup = world(game).level.objects.find(object => same(object, target) && ['terminal', 'renewal', 'package'].includes(object.type) && availableObject(game, object));
  if (pickup) interactObject(game, pickup);
  if (!same(game.player, world(game).extraction)) {
    game.extractionHoldMs = 0; game.extractionProgress = 0; game.extractionTurns = 0;
  } else {
    game.direction = null; game.queuedDirection = null;
    if (!game.carrying) game.message = 'The package is still in the vault.';
    else if (!game.grant?.revoked) game.message = revokeForExtraction;
    else if (!evaluateAuthorization(game, 'drone', 'extract', world(game).extraction.id).allow) game.message = 'Use Transit renewal or collect the Transit key to restore extraction access.';
    else emit(game, 'extracting', 'EXTRACTION LINKING. Hold the pad for two seconds.');
  }
}
function sentryStep(game: EngineState, sentry: SentryState) {
  const definition = world(game).level.sentries.find(item => item.id === sentry.id)!;
  if (!game.carrying && definition.patrol.length && same(sentry.position, definition.patrol[game.patrolIndices[sentry.id]! % definition.patrol.length]!))
    game.patrolIndices[sentry.id] = (game.patrolIndices[sentry.id]! + 1) % definition.patrol.length;
  const next = nextStep(game, sentry.position, sentryTarget(game, sentry));
  if (!next) return;
  const gate = gateBetween(game, sentry.position, next);
  const decision = gate ? authorize(game, sentry.id, 'traverse', gate.id) : null;
  if (decision && !decision.allow) {
    if (sentry.mode !== 'blocked') {
      const role = world(game).level.grants.find(grant => grant.id === gate!.grantId)?.label ?? 'Required';
      emit(game, 'denied', `ACCESS DENIED — ${role} ${decision.reason}. ${sentry.name} is blocked at the ${gate!.label.toLowerCase()} gate.`);
    }
    sentry.mode = 'blocked'; return;
  }
  sentry.mode = game.carrying ? 'chase' : 'patrol'; sentry.position = next; capture(game);
}
function mayExtract(game: EngineState): boolean {
  return same(game.player, world(game).extraction) && game.carrying && Boolean(game.grant?.revoked)
    && evaluateAuthorization(game, 'drone', 'extract', world(game).extraction.id).allow;
}
/** Chronological actor and credential deadlines make timer batching deterministic. */
export function advanceGame(game: EngineState, deltaMs: number): GameState {
  if (!Number.isFinite(deltaMs) || deltaMs < 0) throw new Error('Invalid time delta.');
  let remaining = deltaMs;
  while (remaining > 0 && game.status === 'playing' && !game.defender) {
    const extracting = mayExtract(game);
    if (!extracting) { game.extractionHoldMs = 0; game.extractionProgress = 0; game.extractionTurns = 0; }
    const nextExpiry = Math.min(...game.grants.filter(grant => !grant.revoked && grant.expiresAt > game.elapsedMs).map(grant => grant.expiresAt - game.elapsedMs));
    const step = Math.min(remaining, PLAYER_STEP_MS - game.playerClockMs,
      ...world(game).level.sentries.map(sentry => sentry.stepMs - game.sentryClocks[sentry.id]!),
      extracting ? EXTRACTION_MS - game.extractionHoldMs : Infinity, nextExpiry);
    game.elapsedMs += step; game.playerClockMs += step; remaining -= step;
    for (const sentry of game.sentries) game.sentryClocks[sentry.id]! += step;
    if (extracting) { game.extractionHoldMs += step; game.extractionProgress = Math.min(1, game.extractionHoldMs / EXTRACTION_MS); game.extractionTurns = Math.floor(game.extractionProgress * 3); }
    for (const grant of game.grants) if (!grant.revoked && game.elapsedMs >= grant.expiresAt && !game.expiredNotices.includes(grant.id)) {
      game.expiredNotices.push(grant.id);
      emit(game, 'expired', `${grant.label.toUpperCase()} TIMER EXPIRED. ${grant.id === world(game).level.compromisedGrantId ? 'Vault gates deny both your key and any copied key.' : 'Only Transit access expired; Vault access is unchanged.'} Use ${grant.label} renewal or collect the ${grant.label} key again.`);
    }
    if (game.playerClockMs >= PLAYER_STEP_MS) { game.playerClockMs -= PLAYER_STEP_MS; playerStep(game); }
    for (const sentry of game.sentries) {
      const definition = world(game).level.sentries.find(item => item.id === sentry.id)!;
      if (game.status === 'playing' && game.sentryClocks[sentry.id]! >= definition.stepMs) {
        game.sentryClocks[sentry.id]! -= definition.stepMs; sentryStep(game, sentry);
      }
    }
    syncAliases(game);
    // Capture or expiry at the exact deadline takes priority over completion.
    if (game.status === 'playing' && game.extractionHoldMs >= EXTRACTION_MS && mayExtract(game)) {
      if (authorize(game, 'drone', 'extract', world(game).extraction.id).allow) {
        game.status = 'won'; game.direction = null; game.queuedDirection = null;
        emit(game, 'won', 'PACKAGE SECURED. Compromised access is revoked and your escape permissions still work.');
      }
      break;
    }
    if (!mayExtract(game)) { game.extractionHoldMs = 0; game.extractionProgress = 0; game.extractionTurns = 0; }
  }
  return snapshot(game);
}
export function replayDefender(patch: DefenderPatch): DefenderState {
  const grant = { id: 'maintenance', label: 'Maintenance', expiresAt: 60_000, revoked: patch === 'shutdown',
    resources: patch === 'least-privilege' ? ['service-device'] : ['service-device', 'vault-package'] };
  const policy: AuthorizationPolicy = { actors: ['intruder', 'maintenance'], baseline: [], protected: [
    { action: 'collect', resource: 'vault-package', grantId: 'maintenance' },
    { action: 'service', resource: 'service-device', grantId: 'maintenance' },
  ] };
  const state = { turn: 0, elapsedMs: 0, grants: [grant], holders: { intruder: ['maintenance'], maintenance: ['maintenance'] } };
  const decisions = [evaluateAccess(policy, state, 'intruder', 'collect', 'vault-package'), evaluateAccess(policy, state, 'maintenance', 'service', 'service-device')];
  const attackerDenied = !decisions[0]!.allow, maintenanceAllowed = decisions[1]!.allow;
  return { status: 'result', patch, attackerDenied, maintenanceAllowed, success: attackerDenied && maintenanceAllowed, decisions };
}
function execute(game: EngineState, command: Command) {
  if (command.type === 'select-level') { Object.assign(game, createGame(command.levelId)); return; }
  if (command.type === 'restart') {
    Object.assign(game, createGame(game.levelId), { status: 'playing' });
    emit(game, 'restart', 'The intruders are patrolling. Collect the access key and plan your escape.'); return;
  }
  if (command.type === 'defender-start' && game.status !== 'playing') {
    game.defender = { status: 'ready', patch: null, attackerDenied: null, maintenanceAllowed: null, success: false, decisions: [] };
    game.direction = null; game.queuedDirection = null; return;
  }
  if (command.type === 'defender-patch') {
    if (!game.defender) throw new CommandError('Invalid command: open the defender lab first.');
    game.defender = replayDefender(command.patch); emit(game, 'defender-result'); return;
  }
  if (command.type === 'resume' && game.status === 'paused') { game.defender = null; game.status = 'playing'; return; }
  if (game.defender) return;
  if (command.type === 'start' && game.status === 'title') {
    game.status = 'playing'; emit(game, 'start', 'Steer with W A S D or the arrows. Space brakes your drone; patrols keep moving. Escape pauses everything.'); return;
  }
  if (command.type === 'pause' && game.status === 'playing') { game.status = 'paused'; return; }
  if (command.type === 'revoke' && ['playing', 'paused'].includes(game.status)) { revoke(game, command.grantId); return; }
  if (game.status !== 'playing') return;
  if (command.type === 'move') game.queuedDirection = command.direction;
  else if (command.type === 'wait') { game.direction = null; game.queuedDirection = null; }
  else if (command.type === 'interact') {
    const object = nearby(game);
    if (object) interactObject(game, object);
    else emit(game, 'interaction-missed', 'Nothing to use nearby. Move beside a device; keys and the data package also collect automatically when crossed.');
  }
}
