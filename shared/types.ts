export interface Position { x: number; z: number }
export type Direction = 'north' | 'south' | 'east' | 'west';
export type DefenderPatch = 'open' | 'shutdown' | 'least-privilege';
export type Command =
  | { type: 'move'; direction: Direction }
  | { type: 'select-level'; levelId: number }
  | { type: 'revoke'; grantId: string }
  | { type: 'defender-patch'; patch: DefenderPatch }
  | { type: 'start' | 'interact' | 'wait' | 'pause' | 'resume' | 'restart' | 'defender-start' };

export interface Grant {
  /** Stable named role, as defined by the mission. */
  id: string;
  label: string;
  /** Expiry on the authoritative elapsed game clock, in milliseconds. */
  expiresAt: number;
  revoked: boolean;
  resources: string[];
}
export interface Decision {
  turn: number; actor: string; action: string; resource: string;
  grant: string | null; allow: boolean; reason: string;
}
export interface SentryState {
  id: string; name: string; position: Position;
  mode: 'patrol' | 'chase' | 'blocked';
  behavior: 'hunter' | 'ambusher' | 'warden';
  nextPosition: Position | null;
}
export interface DefenderState {
  status: 'ready' | 'result'; patch: DefenderPatch | null;
  attackerDenied: boolean | null; maintenanceAllowed: boolean | null;
  success: boolean; decisions: Decision[];
}
export interface GameState {
  /** Public attempt identifier for idempotent local score recording, never a session token. */
  runId: string;
  levelId: number;
  status: 'title' | 'playing' | 'paused' | 'won' | 'lost';
  /** Count of actual player tile moves; input requests never increment it. */
  turn: number; elapsedMs: number;
  player: Position; direction: Direction | null; queuedDirection: Direction | null;
  sentries: SentryState[];
  /** Compatibility aliases for the first sentry and compromised role. */
  sentry: Position; sentryActive: boolean; sentryMode: 'patrol' | 'chase' | 'blocked';
  nextSentry: Position | null; grant: Grant | null;
  carrying: boolean; grants: Grant[]; collectedShards: string[];
  /** Normalized real-time uplink progress, from zero to one. */
  extractionProgress: number;
  /** Compatibility display only. Extraction is controlled by elapsed milliseconds. */
  extractionTurns: number;
  message: string; event: string; eventId: number; decisions: Decision[];
  context: string | null; contextObjectId: string | null;
  /** Action for the same reachable, available object as contextObjectId. */
  interactionLabel: string | null;
  defender: DefenderState | null;
}
