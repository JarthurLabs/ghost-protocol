import type { GameState } from '../shared/types';

export type LearningSnapshot = Pick<GameState, 'status' | 'levelId' | 'grants' | 'carrying' | 'elapsedMs' | 'decisions' | 'sentries'>;
export interface LearningFeedback { id: string; term: string; text: string }

export function getLearningFeedback(state: LearningSnapshot): LearningFeedback | null {
  if (state.status === 'title') return null;
  const vault = state.grants.find(grant => grant.id === 'vault');
  const transit = state.grants.find(grant => grant.id === 'transit');
  const hasSeparateExit = state.levelId >= 4;
  if (!vault) return { id: 'credential', term: 'A key is a credential', text: 'It represents access you can present at a gate. Each gate checks its own permission.' };
  if (vault.revoked) {
    if (hasSeparateExit) {
      if (!transit) return { id: 'separate-access-needed', term: 'Separate permissions', text: 'Vault access is closed. Transit is a different key; you still need it for the exit.' };
      if (transit.revoked || transit.expiresAt <= state.elapsedMs) return { id: 'separate-access-needs-renewal', term: 'Separate permissions', text: 'Vault stays closed. Restore Transit at its reader to regain only your exit access.' };
      return { id: 'separate-access-preserved', term: 'Containment', text: 'Vault access is withdrawn. Your separate Transit permission still works. That keeps useful access available.' };
    }
    const denied = state.decisions.some(decision => !decision.allow && decision.grant === 'vault' && decision.reason === 'role revoked' && state.sentries.some(sentry => sentry.id === decision.actor));
    return denied
      ? { id: 'revocation-verified', term: 'Revocation verified', text: 'A pursuer tried the gate and was refused. You removed its permission; the drone itself is still active.' }
      : { id: 'revocation', term: 'Revocation', text: 'You deliberately withdrew Vault access. Its gates now refuse this key for every holder, including you.' };
  }
  if (vault.expiresAt <= state.elapsedMs) return state.carrying
    ? { id: 'shared-expiry', term: 'Expiry', text: 'The shared key timed out for you and the pursuers. Renewing Vault would restore both holders’ access.' }
    : { id: 'expiry', term: 'Expiry', text: 'The key reached its time limit. A Vault clock reader renews that temporary access.' };
  if (state.carrying) return { id: 'copied-access', term: 'A copied credential', text: 'The lab has revealed a copy of your Vault key. The pursuers can now request the same Vault access.' };
  if (transit) return { id: 'scope', term: 'Scope means where it works', text: 'Vault permits archive access. Transit permits exit access. One key does not replace the other.' };
  return { id: 'authorization', term: 'Authorization', text: 'Your key permits access to the archive. Gates check that permission every time you cross.' };
}
