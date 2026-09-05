import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import type { Server } from 'node:http';
import { createGameServer, readPort } from '../server/index.js';
import type { Direction, GameState, Position } from '../shared/types.js';
import { LEVEL } from '../shared/level.js';
import { offsets, path, same } from './maze-helpers.js';
import { setTimeout as delay } from 'node:timers/promises';

let server: Server;
let base: string;
before(async () => {
  server = createGameServer({ production: false });
  for (const port of [5328, 5329, 5327, 5326, 5325, 5324, 5323, 5322]) {
    try {
      await new Promise<void>((resolve, reject) => {
        const onError = (error: Error) => { server.off('listening', onListening); reject(error); };
        const onListening = () => { server.off('error', onError); resolve(); };
        server.once('error', onError); server.once('listening', onListening);
        server.listen(port, '127.0.0.1');
      });
      base = `http://127.0.0.1:${port}`;
      return;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'EADDRINUSE') throw error;
    }
  }
  throw new Error('No Ghost Protocol test port is free in the permitted range.');
});
after(async () => {
  if (server?.listening) await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
});

async function session() {
  const response = await fetch(`${base}/api/state`);
  assert.equal(response.status, 200);
  const setCookie = response.headers.get('set-cookie')!;
  return { cookie: setCookie.split(';')[0]!, setCookie, state: await response.json() as GameState };
}
async function send(cookie: string, body: unknown, origin = base) {
  return fetch(`${base}/api/command`, { method: 'POST', headers: {
    'Content-Type': 'application/json', Cookie: cookie, Origin: origin,
  }, body: JSON.stringify(body) });
}
async function state(cookie: string) {
  return (await fetch(`${base}/api/state`, { headers: { Cookie: cookie } })).json() as Promise<GameState>;
}

test('health identifies this game and sessions use an isolated HTTP-only strict cookie', async () => {
  assert.deepEqual(await (await fetch(`${base}/api/health`)).json(), { game: 'ghost-protocol' });
  const initial = await session();
  assert.match(initial.cookie, /^ghost-protocol-session=[a-f0-9]{64}$/);
  assert.match(initial.setCookie, /HttpOnly/);
  assert.match(initial.setCookie, /SameSite=Strict/);
  assert.equal(initial.state.status, 'title');
  for(const field of ['holders','playerClockMs','sentryClockMs','patrolIndex','extractionHoldMs']) assert.equal(field in initial.state,false);
});

test('forged identity, position, grant, and outcome are rejected before any game mutation', async () => {
  const { cookie } = await session();
  await send(cookie, { type: 'start' });
  await send(cookie, { type: 'pause' });
  const beforeState = await state(cookie);
  for (const field of [
    { actor: 'sentry' }, { identity: 'admin' }, { position: { x: 13, z: 5 } },
    { grant: { resources: ['*'], revoked: false } }, { status: 'won' }, { permission: true },
  ]) {
    const response = await send(cookie, { type: 'wait', ...field });
    assert.equal(response.status, 400);
    assert.deepEqual(await state(cookie), beforeState);
  }
});

test('browser requests from another origin and commands without a session fail closed', async () => {
  const { cookie } = await session();
  assert.equal((await send(cookie, { type: 'start' }, 'https://example.invalid')).status, 403);
  assert.equal((await send(cookie, { type: 'start' }, 'http://127.0.0.1:5999')).status, 403);
  assert.equal((await send('', { type: 'start' })).status, 401);
  const noOrigin = await fetch(`${base}/api/command`, { method: 'POST', headers: {
    'Content-Type': 'application/json', Cookie: cookie,
  }, body: '{"type":"start"}' });
  assert.equal(noOrigin.status, 403);
  assert.equal((await state(cookie)).status, 'title');
});

test('independent sessions cannot choose or overwrite each other’s state', async () => {
  const first = await session();
  const second = await session();
  assert.notEqual(first.cookie, second.cookie);
  await send(first.cookie, { type: 'start' });
  await send(first.cookie, { type: 'move', direction: 'north' });
  await delay(250);
  assert.ok((await state(first.cookie)).turn >= 1);
  assert.equal((await state(second.cookie)).turn, 0);
  assert.equal((await state(second.cookie)).status, 'title');
});

test('concurrent command requests cannot mint time or player steps', async () => {
  const { cookie } = await session();
  await send(cookie, { type: 'start' });
  const startedAt = performance.now();
  const responses = await Promise.all(Array.from({ length: 100 }, () => send(cookie, { type: 'wait' })));
  assert.ok(responses.every(response => response.status === 200));
  const result=await state(cookie);
  assert.equal(result.turn, 0);
  assert.ok(result.elapsedMs <= performance.now()-startedAt+60);
});

async function travelHttp(cookie:string,target:Position,avoidTiles:Position[]=[]){
  let current=await state(cookie);
  for(const direction of path(current.player,target,LEVEL,[],avoidTiles)){
    const expected={x:current.player.x+offsets[direction].x,z:current.player.z+offsets[direction].z};
    await send(cookie,{type:'move',direction});
    const deadline=performance.now()+1000;
    do {await delay(15);current=await state(cookie);} while(!same(current.player,expected)&&performance.now()<deadline);
    assert.deepEqual(current.player,expected);
  }
  await send(cookie,{type:'wait'});
}

test('actual API gate denial remains authoritative during independent sentry patrol',async()=>{
  const {cookie}=await session();await send(cookie,{type:'start'});
  // This route goes around the auto-pickup key instead of collecting it.
  await travelHttp(cookie,LEVEL.gates[0]!.a,LEVEL.objects.filter(object=>object.type==='terminal'));
  const before=await state(cookie);assert.equal(before.grant,null);
  const gate=LEVEL.gates[0]!;const direction=(Object.keys(offsets) as Direction[]).find(direction=>same({x:gate.a.x+offsets[direction].x,z:gate.a.z+offsets[direction].z},gate.b))!;
  await send(cookie,{type:'move',direction});await delay(230);
  const result=await state(cookie);
  assert.deepEqual(result.player,LEVEL.gates[0]!.a);assert.equal(result.turn,before.turn);
  assert.ok(result.elapsedMs>before.elapsedMs);
  assert.ok(result.decisions.some(d=>d.actor==='drone'&&d.resource==='gate-service'&&!d.allow&&d.reason==='no credential'));
});

test('idle browser polling sees autonomous patrol, and HTTP pause freezes it',async()=>{
  const {cookie}=await session();const response=await send(cookie,{type:'start'});const initial=await response.json() as GameState;
  await delay(430);const moving=await state(cookie);assert.notDeepEqual(moving.sentry,initial.sentry);
  assert.deepEqual(moving.player,initial.player);assert.equal(moving.turn,0);assert.ok(moving.elapsedMs>=330);
  await send(cookie,{type:'pause'});const paused=await state(cookie);await delay(450);
  assert.deepEqual(await state(cookie),paused);
  await send(cookie,{type:'resume'});await delay(400);const resumed=await state(cookie);
  assert.ok(resumed.elapsedMs>paused.elapsedMs);assert.equal(resumed.status,'playing');
});

test('disconnected sessions automatically pause and require explicit resume',async()=>{
  const {cookie}=await session();await send(cookie,{type:'start'});
  await delay(2200);const paused=await state(cookie);assert.equal(paused.status,'paused');
  assert.ok(paused.elapsedMs>=1800&&paused.elapsedMs<=2050);
  await delay(120);assert.deepEqual(await state(cookie),paused);
  await send(cookie,{type:'resume'});await delay(120);assert.equal((await state(cookie)).status,'playing');
});

test('unknown inputs, non-JSON bodies, and oversized requests are rejected', async () => {
  const { cookie } = await session();
  assert.equal((await send(cookie, { type: 'teleport' })).status, 400);
  assert.equal((await send(cookie, { type: ['wait'] })).status, 400);
  const text = await fetch(`${base}/api/command`, { method: 'POST', headers: { Cookie: cookie,
    Origin: base, 'Content-Type': 'text/plain' }, body: '{"type":"start"}' });
  assert.equal(text.status, 415);
  assert.equal((await send(cookie, { type: 'wait', padding: 'x'.repeat(3000) })).status, 413);
  assert.equal((await fetch(`${base}/api/missing`)).status, 404);
});

test('port configuration cannot leave the game’s assigned loopback range', () => {
  assert.equal(readPort(undefined, false), 5321);
  assert.equal(readPort(undefined, true), 5320);
  assert.equal(readPort('5329', false), 5329);
  for (const port of ['0', '5319', '5330', '5321oops', '-1', '']) assert.throws(() => readPort(port, false), /5320/);
});

test('campaign API selects only real missions and never accepts client grants, actors, or defender outcomes',async()=>{
  const {cookie}=await session();
  const selected=await send(cookie,{type:'select-level',levelId:5});assert.equal(selected.status,200);
  const initial=await selected.json() as GameState;assert.equal(initial.levelId,5);assert.equal(initial.sentries.length,3);
  assert.equal((await send(cookie,{type:'select-level',levelId:6})).status,400);
  assert.equal((await send(cookie,{type:'select-level',levelId:5,grants:[{id:'vault'}]})).status,400);
  assert.equal((await send(cookie,{type:'revoke',grantId:'vault',actor:'hunter'})).status,400);
  assert.equal((await send(cookie,{type:'defender-patch',patch:'least-privilege'})).status,400);
  assert.deepEqual(await state(cookie),initial);
  assert.equal((await send(cookie,{type:'defender-start'})).status,200);
  assert.equal((await send(cookie,{type:'defender-patch',patch:'open',attackerDenied:true})).status,400);
  const open=await (await send(cookie,{type:'defender-patch',patch:'open'})).json() as GameState;
  assert.equal(open.defender?.attackerDenied,false);assert.equal(open.defender?.maintenanceAllowed,true);assert.equal(open.defender?.success,false);
  const shutdown=await (await send(cookie,{type:'defender-patch',patch:'shutdown'})).json() as GameState;
  assert.equal(shutdown.defender?.attackerDenied,true);assert.equal(shutdown.defender?.maintenanceAllowed,false);assert.equal(shutdown.defender?.success,false);
  const scoped=await (await send(cookie,{type:'defender-patch',patch:'least-privilege'})).json() as GameState;
  assert.equal(scoped.defender?.success,true);assert.equal(scoped.defender?.decisions[0]?.reason,'outside grant scope');
  assert.equal(scoped.elapsedMs,0);
});
