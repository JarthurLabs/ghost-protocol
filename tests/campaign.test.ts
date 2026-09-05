import test from 'node:test';
import assert from 'node:assert/strict';
import * as engine from '../server/engine.js';

test('campaign sessions expose explicit mission, named role list, enemy list and defender state',()=>{
  const game=engine.createGame();
  const state=engine.snapshot(game);
  assert.equal(state.levelId,1);
  assert.deepEqual(state.grants,[]);
  assert.equal(state.sentries.length,1);
  assert.equal(state.contextObjectId,null);
  assert.equal(state.defender,null);
});

test('selecting a mission resets the server session to its title without inheriting access',()=>{
  const game=engine.createGame();engine.applyCommand(game,{type:'start'});
  const state=engine.applyCommand(game,{type:'select-level',levelId:4});
  assert.equal(state.levelId,4);assert.equal(state.status,'title');
  assert.equal(state.elapsedMs,0);assert.deepEqual(state.grants,[]);
});

test('unknown or forged campaign commands leave the state untouched',()=>{
  const game=engine.createGame();
  for(const command of [
    {type:'select-level',levelId:0},{type:'select-level',levelId:6},{type:'select-level',levelId:1.5},
    {type:'select-level',levelId:2,grants:[{id:'vault'}]},
    {type:'revoke',grantId:'vault',actor:'sentry'},
    {type:'defender-patch',patch:'least-privilege',success:true},
    {type:'defender-patch',patch:'allow-all'},
  ]){const before=engine.snapshot(game);assert.throws(()=>engine.applyCommand(game,command),/command/i);assert.deepEqual(engine.snapshot(game),before);}
});

test('defender policy replay denies intruder access while preserving real maintenance only with narrow scope',()=>{
  for(const patch of ['open','shutdown','least-privilege'] as const){
    const result=engine.replayDefender(patch);
    assert.equal(result.patch,patch);
    assert.equal(result.attackerDenied,patch!=='open');
    assert.equal(result.maintenanceAllowed,patch!=='shutdown');
    assert.equal(result.success,patch==='least-privilege');
    assert.deepEqual(result.decisions.map(d=>[d.actor,d.action,d.resource,d.allow]),[
      ['intruder','collect','vault-package',patch==='open'],
      ['maintenance','service','service-device',patch!=='shutdown'],
    ]);
  }
});

test('new attempts have unique public run identifiers and selected missions survive restart',()=>{
  const game=engine.createGame();const before=engine.snapshot(game).runId;
  assert.equal(typeof before,'string');assert.ok(before.length>10);
  engine.applyCommand(game,{type:'select-level',levelId:4});
  assert.notEqual(game.runId,before);const selected=game.runId;
  engine.applyCommand(game,{type:'restart'});
  assert.equal(game.levelId,4);assert.notEqual(game.runId,selected);
});

test('defender lab accepts a replay from title, stops simulation and cannot accept a forged result',()=>{
  const game=engine.createGame();
  engine.applyCommand(game,{type:'defender-start'});
  assert.equal(game.defender?.status,'ready');
  engine.applyCommand(game,{type:'defender-patch',patch:'shutdown'});
  assert.equal(game.defender?.success,false);
  engine.applyCommand(game,{type:'defender-patch',patch:'least-privilege'});
  assert.equal(game.defender?.success,true);assert.equal(game.elapsedMs,0);
});

// Targeted policy fixtures place the server actor at an object; full routes below
// separately prove that every objective is reachable under the live simulation.
import { LEVELS, getLevel } from '../shared/level.js';
import { neighbors, object, offsets, same, travel, path } from './maze-helpers.js';
import { evaluateAccess } from '../server/authorization.js';
import type { Direction } from '../shared/types.js';
function fixture(levelId:number){const game=engine.createGame(levelId);engine.applyCommand(game,{type:'start'});return game;}
function use(game:engine.EngineState,type:'terminal'|'renewal'|'package',grantId?:string){
  const item=object(type,getLevel(game.levelId),grantId);assert.ok(item,`mission ${game.levelId} has ${type} ${grantId??''}`);
  game.player={x:item.x,z:item.z};engine.applyCommand(game,{type:'interact'});return item;
}

test('two named roles remain independent and copied holders receive Vault only',()=>{
  const game=fixture(4),level=getLevel(4);
  for(const definition of level.grants)use(game,'terminal',definition.id);
  use(game,'package');
  assert.equal(game.grants.length,2);
  for(const sentry of game.sentries){
    assert.equal(engine.authorize(game,sentry.id,'traverse','gate-escape').allow,true);
    assert.equal(engine.authorize(game,sentry.id,'traverse','gate-transit').allow,false);
  }
  const console=object('console',level);game.player={x:console.x,z:console.z};
  engine.applyCommand(game,{type:'pause'});
  const before=game.elapsedMs;
  engine.applyCommand(game,{type:'revoke',grantId:level.compromisedGrantId});
  assert.equal(game.status,'paused');assert.equal(game.elapsedMs,before);
  for(const sentry of game.sentries)assert.equal(engine.authorize(game,sentry.id,'traverse','gate-escape').reason,'role revoked');
  assert.equal(engine.authorize(game,'drone','traverse','gate-transit').allow,true);
  assert.equal(engine.authorize(game,'drone','move','escape-floor').allow,true);
});

test('revocation requires the actual local console even when the run is paused',()=>{
  const game=fixture(4),level=getLevel(4);use(game,'terminal',level.compromisedGrantId);
  game.player={...level.start};engine.applyCommand(game,{type:'pause'});
  engine.applyCommand(game,{type:'revoke',grantId:level.compromisedGrantId});
  assert.equal(game.grant?.revoked,false);assert.match(game.message,/console/i);
  const before=engine.snapshot(game);
  assert.throws(()=>engine.applyCommand(game,{type:'revoke',grantId:'invented'}),/command/i);
  assert.deepEqual(engine.snapshot(game),before);
});

test('wrong Transit revocation can be restored locally without reopening the copied Vault role',()=>{
  const game=fixture(4),level=getLevel(4);
  for(const definition of level.grants)use(game,'terminal',definition.id);
  use(game,'package');
  const console=object('console',level);game.player={x:console.x,z:console.z};
  engine.applyCommand(game,{type:'revoke',grantId:level.extractionGrantId!});
  assert.equal(engine.authorize(game,'drone','traverse','gate-transit').reason,'role revoked');
  engine.applyCommand(game,{type:'revoke',grantId:level.compromisedGrantId});
  const restore=level.objects.find(item=>['renewal','terminal'].includes(item.type)&&item.grantId===level.extractionGrantId&&level.tiles.find(tile=>same(tile,item))?.zone==='escape');
  assert.ok(restore,'A Transit recovery terminal must be reachable on the console side.');
  travel(game,restore,['gate-transit']);
  engine.applyCommand(game,{type:'interact'});
  assert.equal(engine.authorize(game,'drone','traverse','gate-transit').allow,true);
  assert.equal(game.grant?.revoked,true);
});

test('expiring role denies both holders at the exact clock boundary and renewal restores the same shared role',()=>{
  const game=fixture(3),level=getLevel(3);use(game,'terminal',level.compromisedGrantId);use(game,'package');
  const grant=game.grant!;game.elapsedMs=grant.expiresAt-1;
  assert.equal(engine.authorize(game,'drone','traverse','gate-escape').allow,true);
  engine.advanceGame(game,1);
  assert.equal(engine.authorize(game,'drone','traverse','gate-escape').reason,'grant expired');
  assert.equal(engine.authorize(game,game.sentries[0]!.id,'traverse','gate-escape').reason,'grant expired');
  const originalId=grant.id;use(game,'renewal',level.compromisedGrantId);
  assert.equal(game.grants.length,1);assert.equal(game.grant!.id,originalId);
  assert.equal(engine.authorize(game,game.sentries[0]!.id,'traverse','gate-escape').allow,true);
  engine.applyCommand(game,{type:'pause'});const paused=engine.snapshot(game);
  engine.advanceGame(game,120_000);assert.deepEqual(engine.snapshot(game),paused);
});

test('Transit expiration at the exact extraction deadline prevents success and resets the hold',()=>{
  const game=fixture(4),level=getLevel(4);
  for(const definition of level.grants)use(game,'terminal',definition.id);
  use(game,'package');const console=object('console',level);game.player={x:console.x,z:console.z};
  engine.applyCommand(game,{type:'revoke',grantId:level.compromisedGrantId});
  const extraction=object('extraction',level);game.player={x:extraction.x,z:extraction.z};
  game.grants.find(grant=>grant.id===level.extractionGrantId)!.expiresAt=game.elapsedMs+engine.EXTRACTION_MS;
  engine.advanceGame(game,engine.EXTRACTION_MS);
  assert.equal(game.status,'playing');assert.equal(game.extractionProgress,0);
  assert.equal(engine.authorize(game,'drone','extract',extraction.id).reason,'grant expired');
});

test('three enemy clocks move independently without player input and pause freezes them all',()=>{
  const game=fixture(5),level=getLevel(5),before=game.sentries.map(item=>({...item.position}));
  assert.equal(game.sentries.length,3);assert.ok(new Set(level.sentries.map(item=>item.stepMs)).size>1);
  const firstTime=Math.min(...level.sentries.map(item=>item.stepMs));engine.advanceGame(game,firstTime);
  game.sentries.forEach((item,index)=>assert.equal(same(item.position,before[index]!),level.sentries[index]!.stepMs>firstTime));
  engine.advanceGame(game,Math.max(...level.sentries.map(item=>item.stepMs))-firstTime);
  game.sentries.forEach((item,index)=>assert.equal(same(item.position,before[index]!),false));
  engine.applyCommand(game,{type:'pause'});const paused=engine.snapshot(game);engine.advanceGame(game,10_000);
  assert.deepEqual(engine.snapshot(game),paused);assert.equal(game.turn,0);
});

test('a collision with a secondary enemy captures the drone and restart resets every enemy',()=>{
  const game=fixture(5),level=getLevel(5),enemy=game.sentries[1]!;
  const adjacent=neighbors(enemy.position,level)[0]!;game.player=adjacent.position;
  const direction=(Object.keys(offsets) as Direction[]).find(direction=>same({x:game.player.x+offsets[direction].x,z:game.player.z+offsets[direction].z},enemy.position))!;
  engine.applyCommand(game,{type:'move',direction});engine.advanceGame(game,engine.PLAYER_STEP_MS);
  assert.equal(game.status,'lost');assert.match(game.message,new RegExp(enemy.name));
  engine.applyCommand(game,{type:'restart'});assert.equal(game.levelId,5);assert.equal(game.status,'playing');
  game.sentries.forEach((item,index)=>assert.deepEqual(item.position,level.sentries[index]!.start));
});

test('the baseline detour works without a role while the privileged shortcut denies passage',()=>{
  const game=fixture(2),level=getLevel(2),detour=level.gates.find(gate=>gate.grantId===null)!;
  assert.ok(detour);assert.equal(engine.authorize(game,'drone','traverse',detour.id).allow,true);
  assert.equal(engine.authorize(game,game.sentries[0]!.id,'traverse',detour.id).allow,true);
  assert.equal(engine.authorize(game,'drone','traverse','gate-service').reason,'no credential');
  const safe=path(level.start,object('package',level),level,['gate-service']);assert.ok(safe.length>0);
});

test('authorization fails closed for unknown actors and action/resource pairings, even when a role lists that resource',()=>{
  const policy={actors:['maintenance'],baseline:[],protected:[{action:'service',resource:'device',grantId:'ops'}]};
  const context={turn:0,elapsedMs:0,grants:[{id:'ops',label:'Operations',expiresAt:10,revoked:false,resources:['device']}],holders:{maintenance:['ops'],impostor:['ops']}};
  assert.equal(evaluateAccess(policy,context,'maintenance','service','device').allow,true);
  assert.equal(evaluateAccess(policy,context,'impostor','service','device').reason,'unknown actor');
  assert.equal(evaluateAccess(policy,context,'maintenance','delete','device').reason,'unknown action or resource');
  assert.equal(evaluateAccess(policy,context,'maintenance','service','other').reason,'unknown action or resource');
  context.grants[0]!.resources=[];
  assert.equal(evaluateAccess(policy,context,'maintenance','service','device').reason,'outside grant scope');
});

import { runMission } from './campaign-routes.js';
for(const levelId of [1,2,3,4,5])test(`mission ${levelId} completes a hand-authored route with every enemy active and real extraction`,()=>{
  const game=runMission(levelId);
  assert.equal(game.status,'won');assert.equal(game.extractionProgress,1);assert.equal(game.carrying,true);
  assert.equal(game.grant?.revoked,true);assert.ok(game.elapsedMs>engine.EXTRACTION_MS);
  assert.equal(game.sentries.length,getLevel(levelId).sentries.length);
  assert.ok(game.decisions.some(decision=>decision.actor!=='drone'&&decision.resource==='gate-escape'&&!decision.allow&&decision.reason==='role revoked'),'The live pursuer must reach and be denied by the revoked escape gate.');
  if(levelId>=4)assert.equal(game.grants.find(grant=>grant.id==='transit')?.revoked,false);
});

test('multiple clocks remain deterministic across different server timer batches',()=>{
  const one=fixture(5),many=structuredClone(one);
  engine.advanceGame(one,1840);for(let index=0;index<92;index++)engine.advanceGame(many,20);
  assert.deepEqual(engine.snapshot(one),engine.snapshot(many));
});

test('a copied Vault role cannot satisfy a named Transit gate even if an unrelated resource is accidentally added',()=>{
  const game=fixture(4);use(game,'terminal','vault');use(game,'package');
  game.grant!.resources.push('gate-transit');
  assert.equal(engine.authorize(game,game.sentries[0]!.id,'traverse','gate-transit').allow,false);
  assert.equal(engine.authorize(game,'drone','traverse','gate-transit').allow,false);
  use(game,'terminal','transit');assert.equal(engine.authorize(game,'drone','traverse','gate-transit').allow,true);
});

test('leaving a defender replay can resume the same paused mission without losing its state',()=>{
  const game=fixture(4);use(game,'terminal','vault');engine.advanceGame(game,75);
  engine.applyCommand(game,{type:'pause'});const before=engine.snapshot(game);
  engine.applyCommand(game,{type:'defender-start'});engine.applyCommand(game,{type:'defender-patch',patch:'open'});
  engine.applyCommand(game,{type:'resume'});
  assert.equal(game.status,'playing');assert.equal(game.defender,null);
  assert.equal(game.runId,before.runId);assert.deepEqual(game.player,before.player);assert.deepEqual(game.grants,before.grants);assert.equal(game.elapsedMs,before.elapsedMs);
});

test('mission two leaves at least two seconds to react at the console before an unrevoked pursuer captures',()=>{
  let atConsole:engine.EngineState|undefined;
  runMission(2,game=>{if(game.event==='revoked')atConsole=structuredClone(game);});
  assert.ok(atConsole);
  // Undo only the test route's immediate revocation to measure the consequence of waiting.
  atConsole.grant!.revoked=false;engine.advanceGame(atConsole,1999);
  assert.equal(atConsole.status,'playing');
  engine.advanceGame(atConsole,2000);assert.equal(atConsole.status,'lost');
});

for(const levelId of [4,5])test(`mission ${levelId} uses live Vault lockdown without pausing or changing Transit or movement intent`,()=>{
  const game=fixture(levelId),level=getLevel(levelId);
  for(const definition of level.grants)use(game,'terminal',definition.id);
  use(game,'package');const console=object('console',level);game.player={x:console.x,z:console.z};
  game.direction='east';game.queuedDirection='north';game.playerClockMs=73;
  const transit=structuredClone(game.grants.find(grant=>grant.id==='transit'));
  const before={elapsedMs:game.elapsedMs,clock:game.playerClockMs,sentryClocks:structuredClone(game.sentryClocks),player:{...game.player},sentries:structuredClone(game.sentries)};
  assert.equal(engine.snapshot(game).contextObjectId,console.id);
  const result=engine.applyCommand(game,{type:'interact'});
  assert.equal(result.status,'playing');assert.equal(result.grant?.revoked,true);
  assert.deepEqual(result.grants.find(grant=>grant.id==='transit'),transit);
  assert.equal(result.direction,'east');assert.equal(result.queuedDirection,'north');
  assert.equal(result.elapsedMs,before.elapsedMs);assert.equal(game.playerClockMs,before.clock);
  assert.deepEqual(game.sentryClocks,before.sentryClocks);assert.deepEqual(result.player,before.player);assert.deepEqual(game.sentries,before.sentries);
  assert.equal(engine.authorize(game,'drone','traverse','gate-transit').allow,true);
  for(const enemy of game.sentries)assert.equal(engine.authorize(game,enemy.id,'traverse','gate-escape').reason,'role revoked');
  assert.notEqual(engine.snapshot(game).contextObjectId,console.id,'Completed Vault lockdown must not invite another action on Transit.');
  engine.applyCommand(game,{type:'interact'});assert.deepEqual(game.grants.find(grant=>grant.id==='transit'),transit);
});
