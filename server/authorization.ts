import type { Decision, Grant } from '../shared/types.js';

export interface AccessRule { action: string; resource: string; grantId?: string }
export interface AuthorizationPolicy {
  actors: string[];
  baseline: (AccessRule & { actor: string })[];
  protected: AccessRule[];
}
export interface AccessContext {
  turn: number; elapsedMs: number; grants: Grant[];
  holders: Record<string, string[]>;
}

/** Pure, fail-closed evaluator used by both live crossings and the defender replay. */
export function evaluateAccess(policy: AuthorizationPolicy, context: AccessContext,
  actor: string, action: string, resource: string): Decision {
  const result: Decision = { turn: context.turn, actor, action, resource, grant: null, allow: false, reason: 'unknown actor' };
  if (!policy.actors.includes(actor)) return result;
  if (policy.baseline.some(rule => rule.actor === actor && rule.action === action && rule.resource === resource)) {
    return { ...result, allow: true, reason: 'baseline permission' };
  }
  const rule = policy.protected.find(candidate => candidate.action === action && candidate.resource === resource);
  if (!rule) return { ...result, reason: 'unknown action or resource' };
  const held = context.holders[actor] ?? [];
  const candidates = context.grants.filter(grant => held.includes(grant.id) && (!rule.grantId || grant.id === rule.grantId));
  if (!candidates.length) return { ...result, reason: 'no credential' };
  // Prefer a valid scoped grant; an unrelated or expired role cannot mask it.
  const grant = candidates.find(item => !item.revoked && context.elapsedMs < item.expiresAt && item.resources.includes(resource)) ?? candidates[0]!;
  result.grant = grant.id;
  if (grant.revoked) return { ...result, reason: 'role revoked' };
  if (context.elapsedMs >= grant.expiresAt) return { ...result, reason: 'grant expired' };
  if (!grant.resources.includes(resource)) return { ...result, reason: 'outside grant scope' };
  return { ...result, allow: true, reason: 'temporary role permits this resource' };
}
