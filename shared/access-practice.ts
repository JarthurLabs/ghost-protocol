import { evaluateAccess, type AccessContext, type AuthorizationPolicy } from '../server/authorization.js';
import type { Decision } from './types.js';

export type PracticeMode = 'borrowed' | 'expiry' | 'scopes';
export type PracticeActor = 'player' | 'copied-holder';
export type PracticeResource = 'vault-gate' | 'transit-exit' | 'ordinary-exit';
export interface PracticeState {
  mode: PracticeMode;
  step: number;
  context: AccessContext;
  decisions: Decision[];
}

export const PRACTICE_DURATION_MS = 10_000;
export const PRACTICE_STEP_COUNTS: Record<PracticeMode, number> = { borrowed: 5, expiry: 3, scopes: 3 };

// These local fixtures never read or write a live game session. Every result uses
// the same pure permission evaluator as a real gate and the defender replay.
const policy: AuthorizationPolicy = {
  actors: ['player', 'copied-holder'],
  baseline: [{ actor: 'player', action: 'cross', resource: 'ordinary-exit' }],
  protected: [
    { action: 'cross', resource: 'vault-gate', grantId: 'vault' },
    { action: 'cross', resource: 'transit-exit', grantId: 'transit' },
  ],
};

export function evaluatePracticeAccess(state: PracticeState, actor: PracticeActor, resource: PracticeResource): Decision {
  return evaluateAccess(policy, state.context, actor, 'cross', resource);
}

function withDecisions(state: PracticeState): PracticeState {
  let requests: [PracticeActor, PracticeResource][] = [['player', 'vault-gate']];
  if (state.mode !== 'borrowed' || state.step >= 2) requests.push(['copied-holder', 'vault-gate']);
  if (state.mode === 'borrowed' && state.step === 4) requests.push(['player', 'ordinary-exit']);
  if (state.mode === 'scopes') {
    requests.push(['player', 'transit-exit']);
    if (state.step === 2) requests = [['player', 'transit-exit'], ['copied-holder', 'transit-exit']];
  }
  return { ...state, decisions: requests.map(([actor, resource]) => evaluatePracticeAccess(state, actor, resource)) };
}

export function createPractice(mode: PracticeMode): PracticeState {
  const context: AccessContext = {
    turn: 0, elapsedMs: 0,
    grants: [{ id: 'vault', label: 'Vault', expiresAt: PRACTICE_DURATION_MS, revoked: false, resources: ['vault-gate'] }],
    holders: { player: [], 'copied-holder': [] },
  };
  if (mode !== 'borrowed') {
    context.holders.player = ['vault'];
    context.holders['copied-holder'] = ['vault'];
  }
  if (mode === 'scopes') {
    context.grants.push({ id: 'transit', label: 'Transit', expiresAt: PRACTICE_DURATION_MS, revoked: false, resources: ['transit-exit'] });
    context.holders.player.push('transit');
  }
  return withDecisions({ mode, step: 0, context, decisions: [] });
}

/** Only an explicit exercise action changes time, holders or permissions. */
export function advancePractice(state: PracticeState): PracticeState {
  if (state.step >= PRACTICE_STEP_COUNTS[state.mode] - 1) return state;
  const next: PracticeState = {
    ...state, step: state.step + 1,
    context: {
      ...state.context, turn: state.context.turn + 1,
      grants: state.context.grants.map(grant => ({ ...grant, resources: [...grant.resources] })),
      holders: Object.fromEntries(Object.entries(state.context.holders).map(([actor, grants]) => [actor, [...grants]])),
    },
  };
  const vault = next.context.grants.find(grant => grant.id === 'vault')!;
  if (next.mode === 'borrowed') {
    if (next.step === 1) next.context.holders.player.push('vault');
    if (next.step === 2) next.context.holders['copied-holder'].push('vault');
    if (next.step === 3) vault.revoked = true;
  } else if (next.mode === 'expiry') {
    if (next.step === 1) next.context.elapsedMs = vault.expiresAt;
    if (next.step === 2) vault.expiresAt = next.context.elapsedMs + PRACTICE_DURATION_MS;
  } else if (next.step === 1) {
    vault.revoked = true;
  }
  return withDecisions(next);
}
