import type { Position } from './types.js';
export type Zone = 'service' | 'vault' | 'escape';
export interface Tile extends Position { zone: Zone }
export interface LevelObject extends Position {
  id: string;
  type: 'terminal' | 'package' | 'console' | 'extraction' | 'renewal';
  /** The named role this pickup or renewal affects. */
  grantId?: string;
}
export interface Gate { id: string; a: Position; b: Position; grantId: string | null; label: string }
export interface GrantDefinition { id: string; label: string; lifetimeMs: number; resources: string[]; color: string }
export interface SentryDefinition {
  id: string; name: string; start: Position; patrol: Position[];
  stepMs: number; behavior: 'hunter' | 'ambusher' | 'warden'; copiedGrantId: string;
}
export interface LevelDefinition {
  id: number; title: string; subtitle: string; concept: string; briefing: string; tip: string;
  debrief: { takeaway: string; realWorld: string };
  width: number; depth: number; tiles: Tile[]; walls: Position[];
  objects: LevelObject[]; gates: Gate[]; start: Position;
  sentries: SentryDefinition[]; grants: GrantDefinition[];
  compromisedGrantId: string; extractionGrantId?: string;
  shards: Position[];
  /** Compatibility aliases for the first sentry; runtime uses sentries. */
  sentryStart: Position; patrol: Position[];
}
