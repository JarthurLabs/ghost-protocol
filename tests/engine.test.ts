import test from 'node:test';
import assert from 'node:assert/strict';
import { LEVEL } from '../shared/level.js';
import { advanceGame, applyCommand, authorize, createGame, snapshot, PLAYER_STEP_MS, EXTRACTION_MS } from '../server/engine.js';
import { key, neighbors, object, offsets, same, travel } from './maze-helpers.js';
import type { Direction } from '../shared/types.js';

const SENTRY_STEP_MS=LEVEL.sentries[0]!.stepMs;
function started(){const game=createGame();applyCommand(game,{type:'start'});return game;}
function borrowed(){const game=started();travel(game,object('terminal'));return game;}
function stolen(){const game=borrowed();travel(game,object('package'));return game;}
function bufferedTurnSetup(){
  const setup=LEVEL.tiles.flatMap(tile=>neighbors(tile).flatMap(first=>{
    const perpendicular=(Object.keys(offsets) as Direction[]).filter(d=>offsets[d].x*offsets[first.direction].x+offsets[d].z*offsets[first.direction].z===0);
    return perpendicular.filter(turn=>!neighbors(tile).some(n=>n.direction===turn)&&neighbors(first.position).some(n=>n.direction===turn))
      .map(turn=>({tile,first,turn}));
  })).find(s=>s.tile.zone==='service'&&LEVEL.tiles.find(t=>same(t,s.first.position))?.zone==='service');
  assert.ok(setup,'The maze should have a buffered-turn junction.');
  return setup;
}

test('enemy patrol advances on the clock while the player gives no input',()=>{
  const game=started(),before={...game.sentry};
  advanceGame(game,SENTRY_STEP_MS-1);assert.deepEqual(game.sentry,before);
  advanceGame(game,1);assert.notDeepEqual(game.sentry,before);
  assert.equal(game.turn,0);assert.deepEqual(game.player,LEVEL.start);
  assert.equal(game.sentryMode,'patrol');assert.equal(game.elapsedMs,SENTRY_STEP_MS);
});

test('commands cannot advance the simulation or accelerate either actor',()=>{
  const game=started(),before=snapshot(game);
  const direction=neighbors(game.player)[0]!.direction;
  for(let i=0;i<200;i++)applyCommand(game,{type:'move',direction});
  assert.equal(game.elapsedMs,0);assert.equal(game.turn,0);
  assert.deepEqual(game.player,before.player);assert.deepEqual(game.sentry,before.sentry);
  advanceGame(game,PLAYER_STEP_MS-1);assert.equal(game.turn,0);
  advanceGame(game,1);assert.equal(game.turn,1);
});

test('continuous travel buffers an unavailable turn until a real junction',()=>{
  const game=started(),setup=bufferedTurnSetup();
  game.player={x:setup.tile.x,z:setup.tile.z};game.direction=setup.first.direction;
  applyCommand(game,{type:'move',direction:setup.turn});
  advanceGame(game,PLAYER_STEP_MS);assert.deepEqual(game.player,setup.first.position);
  assert.equal(game.queuedDirection,setup.turn);
  advanceGame(game,PLAYER_STEP_MS);
  assert.deepEqual(game.player,{x:setup.first.position.x+offsets[setup.turn].x,z:setup.first.position.z+offsets[setup.turn].z});
  assert.equal(game.direction,setup.turn);
});

test('an early corner input cannot erase a starting heading before its first movement tick',()=>{
  const setup=bufferedTurnSetup();
  for(const gap of [0,100,PLAYER_STEP_MS-1]){
    const game=started();game.player={x:setup.tile.x,z:setup.tile.z};
    const start={...game.player};
    applyCommand(game,{type:'move',direction:setup.first.direction});
    advanceGame(game,gap);
    const sentries=structuredClone(game.sentries),sentryClocks={...game.sentryClocks};
    applyCommand(game,{type:'move',direction:setup.turn});
    assert.deepEqual(game.player,start);assert.equal(game.elapsedMs,gap);assert.equal(game.playerClockMs,gap);
    assert.deepEqual(game.sentries,sentries);assert.deepEqual(game.sentryClocks,sentryClocks);
    advanceGame(game,PLAYER_STEP_MS-gap);
    assert.deepEqual(game.player,setup.first.position,`A corner tap after ${gap}ms erased the starting heading`);
    assert.equal(game.queuedDirection,setup.turn);
    advanceGame(game,PLAYER_STEP_MS);
    assert.deepEqual(game.player,{x:setup.first.position.x+offsets[setup.turn].x,z:setup.first.position.z+offsets[setup.turn].z});
  }
});

test('the latest available heading replaces a buffered turn without moving or resetting clocks',()=>{
  const game=started(),setup=bufferedTurnSetup();game.player={x:setup.tile.x,z:setup.tile.z};
  applyCommand(game,{type:'move',direction:setup.first.direction});
  advanceGame(game,73);
  applyCommand(game,{type:'move',direction:setup.turn});
  const before=snapshot(game),sentries=structuredClone(game.sentries),sentryClocks={...game.sentryClocks};
  applyCommand(game,{type:'move',direction:setup.first.direction});
  assert.equal(game.direction,setup.first.direction);assert.equal(game.queuedDirection,null);
  assert.deepEqual(game.player,before.player);assert.equal(game.elapsedMs,73);assert.equal(game.playerClockMs,73);
  assert.deepEqual(game.sentries,sentries);assert.deepEqual(game.sentryClocks,sentryClocks);
  advanceGame(game,PLAYER_STEP_MS-73);assert.deepEqual(game.player,setup.first.position);
});

test('Brake cancels an accepted heading and an early corner while enemy clocks continue',()=>{
  const game=started(),setup=bufferedTurnSetup();game.player={x:setup.tile.x,z:setup.tile.z};
  applyCommand(game,{type:'move',direction:setup.first.direction});
  applyCommand(game,{type:'move',direction:setup.turn});
  applyCommand(game,{type:'wait'});const before=snapshot(game);
  assert.equal(game.direction,null);assert.equal(game.queuedDirection,null);
  advanceGame(game,SENTRY_STEP_MS);
  assert.deepEqual(game.player,before.player);assert.equal(game.elapsedMs,SENTRY_STEP_MS);
  assert.notDeepEqual(game.sentry,before.sentry);
});

test('Space stops the player without stopping the sentry or the clock',()=>{
  const game=started();applyCommand(game,{type:'move',direction:neighbors(game.player)[0]!.direction});
  applyCommand(game,{type:'wait'});const before={...game.sentry};
  advanceGame(game,SENTRY_STEP_MS);assert.deepEqual(game.player,LEVEL.start);
  assert.notDeepEqual(game.sentry,before);assert.equal(game.direction,null);assert.equal(game.queuedDirection,null);
});

test('wall collisions cannot create movement and objects are passable auto pickups',()=>{
  const game=started();const blocked=(Object.keys(offsets) as Direction[]).find(d=>!neighbors(game.player).some(n=>n.direction===d));
  assert.ok(blocked);applyCommand(game,{type:'move',direction:blocked});advanceGame(game,PLAYER_STEP_MS);
  assert.deepEqual(game.player,LEVEL.start);assert.equal(game.turn,0);
  travel(game,object('terminal'));assert.ok(game.grant);assert.deepEqual(game.player,{x:object('terminal').x,z:object('terminal').z});
  assert.equal(game.grant.expiresAt,game.elapsedMs+LEVEL.grants[0]!.lifetimeMs);
});

test('pause freezes all clocks, actors and extraction while preserving buffered travel',()=>{
  const game=borrowed();applyCommand(game,{type:'move',direction:neighbors(game.player)[0]!.direction});
  advanceGame(game,73);applyCommand(game,{type:'pause'});const before=snapshot(game);
  advanceGame(game,10_000);applyCommand(game,{type:'move',direction:'west'});applyCommand(game,{type:'interact'});
  assert.deepEqual(snapshot(game),before);applyCommand(game,{type:'resume'});advanceGame(game,PLAYER_STEP_MS-73);
  assert.equal(game.turn,before.turn+1);assert.equal(game.elapsedMs,before.elapsedMs+PLAYER_STEP_MS-73);
});

test('exact gate crossings require real holder possession and gate resources are scoped',()=>{
  const game=started(),gate=LEVEL.gates[0]!;game.player={...gate.a};
  const d=(Object.keys(offsets) as Direction[]).find(d=>same({x:gate.a.x+offsets[d].x,z:gate.a.z+offsets[d].z},gate.b))!;
  const before=snapshot(game),sentryClocks={...game.sentryClocks};
  applyCommand(game,{type:'move',direction:d});
  assert.deepEqual(game.player,gate.a);assert.equal(game.turn,0);assert.equal(game.elapsedMs,0);
  assert.deepEqual(game.decisions,before.decisions);assert.deepEqual(game.sentryClocks,sentryClocks);
  advanceGame(game,PLAYER_STEP_MS);
  assert.deepEqual(game.player,gate.a);assert.equal(game.turn,0);
  assert.equal(game.decisions.at(-1)?.allow,false);assert.equal(game.decisions.at(-1)?.reason,'no credential');
  const withGrant=borrowed();withGrant.player={...gate.a};applyCommand(withGrant,{type:'move',direction:d});advanceGame(withGrant,PLAYER_STEP_MS);
  assert.deepEqual(withGrant.player,gate.b);
  withGrant.grant!.resources=['gate-service'];
  assert.equal(authorize(withGrant,'drone','collect','vault-package').allow,false);
  assert.equal(authorize(withGrant,'drone','move','escape-floor').allow,true);
  assert.equal(authorize(withGrant,'impostor','move','service-floor').allow,false);
  assert.equal(authorize(withGrant,'drone','delete','service-floor').allow,false);
});

test('grant expiry uses authoritative elapsed milliseconds and denies both copied holders exactly at the boundary',()=>{
  const game=stolen();assert.ok(game.grant);const expiry=game.grant.expiresAt;
  game.elapsedMs=expiry-1;
  assert.equal(authorize(game,'drone','traverse','gate-escape').allow,true);
  assert.equal(authorize(game,'sentry','traverse','gate-escape').allow,true);
  game.elapsedMs=expiry;
  assert.equal(authorize(game,'drone','traverse','gate-escape').allow,false);
  assert.equal(authorize(game,'sentry','traverse','gate-escape').allow,false);
  assert.equal(game.decisions.at(-1)?.reason,'grant expired');
});

test('complete maze heist collects keys automatically, locks the pursuing sentry outside, and holds extraction for real seconds',()=>{
  const game=stolen();assert.equal(game.carrying,true);assert.equal(game.sentryMode,'chase');
  travel(game,object('console'));applyCommand(game,{type:'interact'});assert.equal(game.grant?.revoked,true);
  assert.equal(authorize(game,'drone','traverse','gate-escape').allow,false);
  assert.equal(authorize(game,'sentry','traverse','gate-escape').allow,false);
  assert.equal(authorize(game,'drone','move','escape-floor').allow,true);
  travel(game,object('extraction'));assert.equal(game.extractionProgress,0);
  advanceGame(game,EXTRACTION_MS-1);assert.equal(game.status,'playing');
  assert.ok(game.extractionProgress>0.99);advanceGame(game,1);assert.equal(game.status,'won');
  assert.equal(game.extractionProgress,1);assert.equal(game.sentryActive,true);
  assert.ok(game.decisions.some(d=>d.actor===game.sentries[0]!.id&&d.resource==='gate-escape'&&!d.allow&&d.reason==='role revoked'));
});

test('an expired but unrevoked grant cannot complete extraction',()=>{
  const game=stolen();travel(game,object('console'));game.grant!.expiresAt=game.elapsedMs;
  travel(game,object('extraction'));advanceGame(game,EXTRACTION_MS+1000);
  assert.equal(game.status,'playing');assert.equal(game.extractionProgress,0);
  assert.match(snapshot(game).context!,/lock.*console/i);
});

test('shared-tile and edge-swap contact capture before either actor can escape',()=>{
  const game=started();const n=neighbors(game.sentry)[0]!;game.player=n.position;
  const toward=(Object.keys(offsets) as Direction[]).find(d=>same({x:n.position.x+offsets[d].x,z:n.position.z+offsets[d].z},game.sentry))!;
  applyCommand(game,{type:'move',direction:toward});advanceGame(game,PLAYER_STEP_MS);
  assert.equal(game.status,'lost');assert.equal(key(game.player),key(game.sentry));
  const edge=started();edge.player=n.position;edge.carrying=true;edge.sentryClocks[edge.sentries[0]!.id]=SENTRY_STEP_MS-PLAYER_STEP_MS;
  applyCommand(edge,{type:'move',direction:toward});advanceGame(edge,PLAYER_STEP_MS);
  assert.equal(edge.status,'lost');
});

test('shards count once and restart restores all state',()=>{
  const game=started();travel(game,object('terminal'));const shard=neighbors(game.player).find(n=>LEVEL.shards.some(s=>same(s,n.position)))!;travel(game,shard.position);assert.ok(game.collectedShards.length>0);
  const before=game.collectedShards.length;advanceGame(game,500);assert.equal(game.collectedShards.length,before);
  applyCommand(game,{type:'restart'});assert.equal(game.status,'playing');assert.equal(game.elapsedMs,0);
  assert.equal(game.turn,0);assert.equal(game.grant,null);assert.equal(game.carrying,false);
  assert.deepEqual(game.player,LEVEL.start);assert.deepEqual(game.collectedShards,[]);
});

test('public snapshots omit credentials and scheduler internals and previews never manufacture decisions',()=>{
  const game=stolen(),before=structuredClone(game.decisions);const publicState=snapshot(game) as unknown as Record<string,unknown>;
  for(const field of ['holders','playerClockMs','sentryClocks','patrolIndices','expiredNotices','extractionHoldMs'])assert.equal(field in publicState,false);
  snapshot(game);snapshot(game);assert.deepEqual(game.decisions,before);
  assert.ok(publicState.nextSentry);publicState.player={x:99,z:99};assert.notEqual(game.player.x,99);
});

test('forged commands and invalid time deltas fail before mutation',()=>{
  const game=borrowed();
  for(const input of [null,[],{},{type:'move'},{type:'move',direction:'up'},{type:'interact',actor:'sentry'},
    {type:'wait',permission:true},{type:'move',direction:'east',position:{x:21,z:11}},{type:'win'},{type:['wait']},
    {type:'wait',elapsedMs:9999},{type:'wait',direction:null}]){
    const before=snapshot(game);assert.throws(()=>applyCommand(game,input),/command/i);assert.deepEqual(snapshot(game),before);
  }
  for(const delta of [-1,NaN,Infinity]){const before=snapshot(game);assert.throws(()=>advanceGame(game,delta),/time/i);assert.deepEqual(snapshot(game),before);}
});

test('leaving extraction resets the hold, while pausing preserves partial progress',()=>{
  const game=stolen();travel(game,object('console'));applyCommand(game,{type:'interact'});travel(game,object('extraction'));
  advanceGame(game,500);assert.equal(game.extractionProgress,0.25);
  applyCommand(game,{type:'pause'});advanceGame(game,5000);assert.equal(game.extractionProgress,0.25);
  applyCommand(game,{type:'resume'});
  const neighbor=neighbors(game.player)[0]!;applyCommand(game,{type:'move',direction:neighbor.direction});advanceGame(game,PLAYER_STEP_MS);
  applyCommand(game,{type:'wait'});assert.equal(game.extractionProgress,0);
  travel(game,object('extraction'));assert.equal(game.extractionProgress,0);
  advanceGame(game,EXTRACTION_MS-1);assert.equal(game.status,'playing');advanceGame(game,1);assert.equal(game.status,'won');
});

test('a sentry collision at the exact extraction deadline wins over mission completion',()=>{
  const game=stolen();travel(game,object('console'));applyCommand(game,{type:'interact'});travel(game,object('extraction'));
  game.extractionHoldMs=EXTRACTION_MS-10;game.extractionProgress=game.extractionHoldMs/EXTRACTION_MS;
  game.sentries[0]!.position=neighbors(game.player)[0]!.position;game.sentryClocks[game.sentries[0]!.id]=SENTRY_STEP_MS-10;
  advanceGame(game,10);assert.equal(game.status,'lost');assert.equal(game.event,'captured');
});

test('different server timer batch sizes produce identical movement and decisions',()=>{
  const single=borrowed(),batched=structuredClone(single);
  applyCommand(single,{type:'move',direction:'east'});applyCommand(batched,{type:'move',direction:'east'});
  advanceGame(single,1980);for(let i=0;i<99;i++)advanceGame(batched,20);
  assert.deepEqual(snapshot(single),snapshot(batched));
});
