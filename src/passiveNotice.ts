import type { GameState } from '../shared/types';

export type NoticeSnapshot = Pick<GameState, 'runId' | 'status' | 'elapsedMs' | 'message'>;
export interface PassiveNotice { runId: string; message: string; expiresAt: number | null }

export function updatePassiveNotice(current: PassiveNotice | null, next: NoticeSnapshot, now: number): PassiveNotice {
  const sameMessage = current?.runId === next.runId && current.message === next.message;
  const active = next.status === 'playing' && next.elapsedMs > 0 && next.message.trim() !== '';
  // Keep the last message after expiry, so state ticks cannot show it again.
  const expiresAt = active ? (sameMessage ? current.expiresAt : now + 3500) : null;
  if (sameMessage && current.expiresAt === expiresAt) return current;
  return { runId: next.runId, message: next.message, expiresAt };
}

export function expirePassiveNotice(current: PassiveNotice | null, now: number): PassiveNotice | null {
  if (current?.expiresAt == null || now < current.expiresAt) return current;
  return { ...current, expiresAt: null };
}
