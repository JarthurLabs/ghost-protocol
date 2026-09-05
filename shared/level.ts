import type { Position } from './types.js';
import type { Gate, GrantDefinition, LevelDefinition, LevelObject, SentryDefinition, Tile, Zone } from './campaign-schema.js';
export type { Gate, GrantDefinition, LevelDefinition, LevelObject, SentryDefinition, Tile, Zone } from './campaign-schema.js';

type Segment = readonly [number, number, number, number];
type AuthoredLevel = Omit<LevelDefinition, 'tiles' | 'walls' | 'shards' | 'sentryStart' | 'patrol'> & { corridors: Record<Zone, readonly Segment[]> };
const p = (x: number, z: number): Position => ({ x, z });
const object = (id: string, type: LevelObject['type'], x: number, z: number, grantId?: string): LevelObject => ({ id, type, x, z, ...(grantId ? { grantId } : {}) });
const gate = (id: string, x: number, z: number, bx: number, bz: number, grantId: string | null, label: string): Gate => ({ id, a: p(x, z), b: p(bx, bz), grantId, label });
const vault = (lifetimeMs = 120_000): GrantDefinition => ({ id: 'vault', label: 'Vault', lifetimeMs, resources: ['gate-service', 'gate-escape', 'vault-package'], color: '#f0b84e' });
const transit = (lifetimeMs = 90_000): GrantDefinition => ({ id: 'transit', label: 'Transit', lifetimeMs, resources: ['gate-transit', 'extraction-pad'], color: '#53efdd' });
const enemy = (id: string, name: string, start: Position, patrol: Position[], stepMs: number, behavior: SentryDefinition['behavior'] = 'hunter'): SentryDefinition => ({ id, name, start, patrol, stepMs, behavior, copiedGrantId: 'vault' });

/** Hand-authored axis-aligned corridor strokes, not a procedural maze generator.
 * The exact same floor graph drives collision, policy crossings and geometry. */
function author(data: AuthoredLevel): LevelDefinition {
  const floor = new Map<string, Tile>();
  for (const zone of ['service', 'vault', 'escape'] as const) for (const [x1, z1, x2, z2] of data.corridors[zone]) {
    if (x1 !== x2 && z1 !== z2) throw new Error(`Mission ${data.id}: diagonal corridor`);
    for (let x = Math.min(x1, x2); x <= Math.max(x1, x2); x++) for (let z = Math.min(z1, z2); z <= Math.max(z1, z2); z++) {
      const old = floor.get(`${x},${z}`);
      if (old && old.zone !== zone) throw new Error(`Mission ${data.id}: overlapping sectors`);
      floor.set(`${x},${z}`, { x, z, zone });
    }
  }
  const tiles = [...floor.values()].sort((a, b) => a.z - b.z || a.x - b.x);
  const walls: Position[] = [];
  for (let z = 0; z < data.depth; z++) for (let x = 0; x < data.width; x++) if (!floor.has(`${x},${z}`)) walls.push(p(x, z));
  const occupied = new Set([`${data.start.x},${data.start.z}`, ...data.objects.map(o => `${o.x},${o.z}`)]);
  const { corridors: _corridors, ...definition } = data;
  return { ...definition, tiles, walls, shards: tiles.filter(t => !occupied.has(`${t.x},${t.z}`)).map(({ x, z }) => p(x, z)), sentryStart: { ...data.sentries[0]!.start }, patrol: data.sentries[0]!.patrol.map(q => ({ ...q })) };
}

export const LEVELS: LevelDefinition[] = [
  author({
    id: 1, title: 'Borrowed Access', subtitle: 'Borrow the key. Switch off its copy.', concept: 'Digital keys and revocation',
    briefing: 'You are an authorized tester. Collect the amber Vault key to open archive gates automatically. Recover the package, cross into cyan, then press E at the Vault door switch.',
    tip: 'Practice steering in the workshop loop. Patrols can catch you before the package starts the chase. Gold chips are optional; leave room to turn back.',
    debrief: { takeaway: 'Vault lockdown disables the same permission for your key and the sentry’s copy.', realWorld: 'A digital key is a credential. Disable an exposed key, then try it again to confirm the system denies access.' },
    width: 23, depth: 15, start: p(1,11), compromisedGrantId: 'vault', grants: [vault()],
    corridors: {
      service: [[1,7,1,11],[1,11,5,11],[5,7,5,11],[1,7,6,7],[3,7,3,3],[1,3,3,3]],
      vault: [[7,7,7,3],[7,3,13,3],[11,1,11,3],[13,3,13,5],[13,5,15,5],[15,5,15,9],[7,7,11,7],[11,3,11,7],[9,7,9,11],[9,11,13,11],[13,9,13,13],[13,9,16,9],[7,9,9,9],[15,3,15,5]],
      escape: [[17,9,21,9],[17,9,17,13],[17,13,21,13],[21,5,21,13],[17,5,21,5],[17,5,17,7],[19,7,21,7]],
    },
    objects: [object('maintenance-terminal','terminal',3,11,'vault'),object('vault-package','package',11,1,'vault'),object('revocation-console','console',17,9,'vault'),object('extraction-pad','extraction',21,13)],
    gates: [gate('gate-service',6,7,7,7,'vault','VAULT'),gate('gate-escape',16,9,17,9,'vault','VAULT')],
    sentries: [enemy('hunter','Hunter',p(13,13),[p(13,13),p(9,11),p(9,7),p(11,7),p(13,9)],340)],
  }),
  author({
    id: 2, title: 'Long Way Home', subtitle: 'Ordinary access. An extra shortcut.', concept: 'Ordinary and extra permissions',
    briefing: 'The NO KEY maintenance detour uses ordinary access. The amber Vault key opens a faster shortcut, including for a pursuer holding its copy. Recover the package, cross into cyan, then press E at the Vault door switch.',
    tip: 'Follow the ivory maintenance route north for a longer entrance, or use the direct Vault gate. Both lead to the archive.',
    debrief: { takeaway: 'The maintenance route needs no temporary Vault key. The shortcut needs extra permission; taking either route does not change your permissions.', realWorld: 'Keep a support worker’s everyday ticket access when temporary admin access is removed.' },
    width: 25, depth: 15, start: p(1,11), compromisedGrantId: 'vault', grants: [vault(90_000)],
    corridors: {
      service: [[1,7,1,11],[1,11,6,11],[1,7,5,7],[5,5,5,11],[5,5,6,5],[3,3,3,7],[1,3,3,3]],
      vault: [[7,5,7,11],[7,7,11,7],[11,3,11,7],[11,3,15,3],[15,3,15,5],[15,5,17,5],[17,5,17,9],[7,11,9,11],[9,11,9,13],[9,13,15,13],[15,9,15,13],[15,9,18,9],[9,5,9,7],[11,9,13,9],[13,9,13,13],[17,3,17,5]],
      escape: [[19,9,23,9],[19,9,19,13],[19,13,23,13],[23,5,23,13],[19,5,23,5],[19,5,19,7],[21,7,23,7]],
    },
    objects: [object('maintenance-terminal','terminal',3,11,'vault'),object('vault-package','package',13,3,'vault'),object('revocation-console','console',19,9,'vault'),object('extraction-pad','extraction',23,13)],
    gates: [gate('gate-service',6,11,7,11,'vault','SHORTCUT'),gate('maintenance-detour',6,5,7,5,null,'MAINTENANCE'),gate('gate-escape',18,9,19,9,'vault','VAULT')],
    sentries: [enemy('hunter','Hunter',p(11,9),[p(13,13),p(9,13),p(7,11),p(11,7),p(15,9)],410)],
  }),
  author({
    id: 3, title: 'Expiry Window', subtitle: 'Access has a deadline.', concept: 'Expiry and renewal',
    briefing: 'Vault access lasts twenty-four seconds of active play. Pass over the raised Vault clock reader before the northern package run. Two units patrol the archive.',
    tip: 'The raised clock reader refreshes the Vault key named on it. Use it before committing north. Pause freezes the game clock, so you can inspect the route calmly.',
    debrief: { takeaway: 'A key expires at its deadline. In this lab, a reader extends that deadline for every holder; Vault lockdown switches access off immediately.', realWorld: 'A sign-in session can time out. If its token is stolen, end the session instead of waiting for the timer.' },
    width: 27, depth: 17, start: p(1,13), compromisedGrantId: 'vault', grants: [vault(24_000)],
    corridors: {
      service: [[1,9,1,13],[1,13,5,13],[5,9,5,13],[1,9,6,9],[3,5,3,9],[1,5,3,5],[5,5,5,9]],
      vault: [[7,5,7,9],[7,5,11,5],[11,1,11,5],[11,1,15,1],[15,1,15,5],[15,5,17,5],[17,5,17,13],[13,9,17,9],[13,9,13,13],[13,13,18,13],[7,9,9,9],[9,9,9,15],[9,13,11,13],[11,13,11,15],[11,15,15,15],[15,13,15,15],[9,3,9,5],[13,1,13,3],[11,7,11,9],[9,9,11,9]],
      escape: [[19,13,25,13],[19,9,19,15],[19,15,23,15],[23,13,23,15],[25,7,25,15],[21,7,25,7],[21,7,21,11],[23,9,25,9]],
    },
    objects: [object('maintenance-terminal','terminal',3,13,'vault'),object('vault-renewal','renewal',11,5,'vault'),object('vault-package','package',15,1,'vault'),object('revocation-console','console',19,13,'vault'),object('extraction-pad','extraction',25,15)],
    gates: [gate('gate-service',6,9,7,9,'vault','VAULT'),gate('gate-escape',18,13,19,13,'vault','VAULT')],
    sentries: [enemy('hunter','Hunter',p(7,7),[p(9,15),p(11,15),p(15,15),p(13,13),p(9,13)],420),enemy('ambusher','Ambusher',p(17,5),[p(17,9),p(13,9),p(13,13),p(17,13)],480,'ambusher')],
  }),
  author({
    id: 4, title: 'Two Locks', subtitle: 'Two keys. One lockdown.', concept: 'Scope: which doors a key opens',
    briefing: 'Collect both keys before entering the archive. Amber Vault opens archive gates; cyan Transit opens the final exit. Gates match keys automatically. Cross into cyan and press E at the Vault door switch. Only Vault access is switched off.',
    tip: 'The raised cyan clock reader refreshes only the Transit key. Your final exit uses that key automatically, even after Vault lockdown.',
    debrief: { takeaway: 'One press at Vault lockdown removed copied archive access while the separate Transit key kept the exit working.', realWorld: 'Use separate keys for separate services, so one exposed key can be disabled without stopping unrelated work.' },
    width: 29, depth: 17, start: p(1,13), compromisedGrantId: 'vault', extractionGrantId: 'transit', grants: [vault(90_000),transit()],
    corridors: {
      service: [[1,9,1,13],[1,13,7,13],[7,9,7,13],[1,9,8,9],[3,5,3,9],[3,5,5,5],[5,3,5,5]],
      vault: [[9,3,9,9],[9,3,17,3],[13,1,13,3],[17,3,17,7],[17,7,19,7],[19,7,19,11],[19,11,20,11],[9,9,11,9],[11,9,11,13],[11,13,15,13],[15,9,15,15],[15,9,17,9],[17,7,17,9],[15,15,19,15],[19,11,19,15],[11,7,13,7],[13,3,13,7],[11,5,13,5],[17,1,19,1],[17,1,17,3]],
      escape: [[21,11,25,11],[21,11,21,15],[21,15,23,15],[23,11,23,15],[25,7,25,15],[25,7,27,7],[27,7,27,15],[25,15,27,15],[25,9,27,9],[23,7,25,7]],
    },
    objects: [object('maintenance-terminal','terminal',3,13,'vault'),object('transit-terminal','terminal',5,9,'transit'),object('vault-package','package',13,1,'vault'),object('revocation-console','console',21,11,'vault'),object('transit-recovery','renewal',21,13,'transit'),object('extraction-pad','extraction',27,15,'transit')],
    gates: [gate('gate-service',8,9,9,9,'vault','VAULT'),gate('gate-escape',20,11,21,11,'vault','VAULT'),gate('gate-transit',23,11,24,11,'transit','TRANSIT')],
    sentries: [enemy('hunter','Hunter',p(19,9),[p(11,13),p(11,9),p(9,9),p(13,7)],340),enemy('warden','Warden',p(9,7),[p(17,15),p(19,11),p(19,7),p(17,9)],430,'warden')],
  }),
  author({
    id: 5, title: 'Ghost Protocol', subtitle: 'Close the breach. Keep your way out.', concept: 'Check every access request',
    briefing: 'Collect Vault and Transit before entering the archive. Three units patrol inside. Refresh Vault at its raised clock readers during the long run. Cross into cyan, press E at the Vault door switch, then use Transit at the final exit.',
    tip: 'Raised amber clock readers refresh Vault; the cyan clock reader refreshes Transit. Use the named reader you need before the package sprint or final exit.',
    debrief: { takeaway: 'Each gate checks its own access rule. Disabling copied Vault access can preserve the separate Transit permission needed to leave.', realWorld: 'After changing permissions, test both a forbidden action and an everyday task that must still work.' },
    width: 31, depth: 19, start: p(1,15), compromisedGrantId: 'vault', extractionGrantId: 'transit', grants: [vault(26_000),transit(75_000)],
    corridors: {
      service: [[1,11,1,15],[1,15,7,15],[7,5,7,15],[1,11,8,11],[7,5,8,5],[3,7,3,11],[1,7,3,7],[5,5,7,5],[5,1,5,5],[3,3,5,3]],
      vault: [[9,5,9,15],[9,11,13,11],[13,7,13,13],[11,7,13,7],[11,3,11,7],[11,3,15,3],[15,1,15,3],[15,1,21,1],[19,1,19,5],[19,5,21,5],[21,1,21,5],[17,5,19,5],[17,5,17,9],[17,9,21,9],[21,9,21,15],[19,13,21,13],[19,13,19,17],[19,15,22,15],[9,15,11,15],[11,15,11,17],[11,17,19,17],[15,13,15,17],[13,13,15,13],[9,3,11,3],[9,3,9,1],[13,3,13,5],[13,5,15,5],[21,7,21,9],[17,11,19,11],[19,9,19,11]],
      escape: [[23,15,27,15],[23,11,23,15],[23,11,25,11],[25,11,25,15],[27,11,27,17],[27,11,29,11],[29,7,29,17],[27,17,29,17],[25,7,27,7],[25,7,25,9],[27,7,29,7]],
    },
    objects: [object('maintenance-terminal','terminal',3,15,'vault'),object('transit-terminal','terminal',5,11,'transit'),object('vault-renewal','renewal',13,7,'vault'),object('vault-renewal-east','renewal',17,9,'vault'),object('vault-package','package',19,1,'vault'),object('revocation-console','console',23,15,'vault'),object('transit-recovery','renewal',23,13,'transit'),object('extraction-pad','extraction',29,17,'transit')],
    gates: [gate('gate-service',8,11,9,11,'vault','SHORTCUT'),gate('maintenance-detour',8,5,9,5,null,'MAINTENANCE'),gate('gate-escape',22,15,23,15,'vault','VAULT'),gate('gate-transit',25,15,26,15,'transit','TRANSIT')],
    sentries: [enemy('hunter','Hunter',p(11,5),[p(11,17),p(9,15),p(13,11),p(15,13)],340),enemy('ambusher','Ambusher',p(9,1),[p(21,5),p(21,1),p(15,1),p(17,5)],430,'ambusher'),enemy('warden','Warden',p(9,7),[p(11,17),p(9,15),p(13,11),p(15,13)],520,'warden')],
  }),
];

export function getLevel(id: number): LevelDefinition {
  const level = LEVELS.find(candidate => candidate.id === id);
  if (!level) throw new RangeError(`Unknown mission: ${id}`);
  return level;
}
export const LEVEL = LEVELS[0]!;
