import test from 'node:test';
import assert from 'node:assert/strict';
import { getLearningFeedback, type LearningSnapshot } from '../src/learningFeedback';
import type { Grant } from '../shared/types';

const vault = (changes: Partial<Grant> = {}): Grant => ({ id: 'vault', label: 'Vault', expiresAt: 1000, revoked: false, resources: ['gate-service'], ...changes });
const transit = (changes: Partial<Grant> = {}): Grant => ({ id: 'transit', label: 'Transit', expiresAt: 2000, revoked: false, resources: ['gate-transit'], ...changes });
const snapshot = (changes: Partial<LearningSnapshot> = {}): LearningSnapshot => ({ status: 'playing', levelId: 1, grants: [], carrying: false, elapsedMs: 0, decisions: [], sentries: [{ id: 'hunter', name: 'Hunter', position: { x: 0, z: 0 }, mode: 'patrol', behavior: 'hunter', nextPosition: null }], ...changes });

test('new and restarted attempts explain a credential without claiming a copy exists', () => {
  assert.equal(getLearningFeedback(snapshot())?.id, 'credential');
  assert.equal(getLearningFeedback(snapshot({ grants: [vault()] }))?.id, 'authorization');
  assert.equal(getLearningFeedback(snapshot({ status: 'title' })), null);
});
test('the package reveal changes the lesson to copied access', () => {
  assert.equal(getLearningFeedback(snapshot({ grants: [vault()], carrying: true }))?.id, 'copied-access');
});
test('expiry is explained at the exact grant deadline, before and after the copy', () => {
  assert.equal(getLearningFeedback(snapshot({ grants: [vault()], elapsedMs: 999 }))?.id, 'authorization');
  assert.equal(getLearningFeedback(snapshot({ grants: [vault()], elapsedMs: 1000 }))?.id, 'expiry');
  assert.equal(getLearningFeedback(snapshot({ grants: [vault()], elapsedMs: 1000, carrying: true }))?.id, 'shared-expiry');
});
test('a revoked grant alone is not presented as an observed enemy denial', () => {
  const state = snapshot({ grants: [vault({ revoked: true })], carrying: true });
  assert.equal(getLearningFeedback(state)?.id, 'revocation');
  state.decisions = [{ actor: 'drone', action: 'traverse', resource: 'gate-service', grant: 'vault', allow: false, reason: 'role revoked', turn: 1 }];
  assert.equal(getLearningFeedback(state)?.id, 'revocation');
  state.decisions.push({ ...state.decisions[0], actor: 'hunter' });
  assert.equal(getLearningFeedback(state)?.id, 'revocation-verified');
});
test('separate-scope guidance does not claim expired or missing Transit still works', () => {
  const state = snapshot({ levelId: 4, grants: [vault({ revoked: true }), transit()], carrying: true });
  assert.equal(getLearningFeedback(state)?.id, 'separate-access-preserved');
  state.elapsedMs = 2000;
  assert.equal(getLearningFeedback(state)?.id, 'separate-access-needs-renewal');
  state.grants.pop();
  assert.equal(getLearningFeedback(state)?.id, 'separate-access-needed');
});
