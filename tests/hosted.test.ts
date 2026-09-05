import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import { handleHosted, type HostedEnv } from '../hosted/worker.js';

const origin='https://ghost-protocol.jamalarthur1.chatgpt.site';
function fixture(){
  const sql=new DatabaseSync(':memory:');sql.exec(readFileSync(new URL('../drizzle/0000_game_sessions.sql',import.meta.url),'utf8'));
  let now=1_800_000_000_000, writes=0, ambiguous=false;
  const DB={prepare(query:string){let args:any[]=[];const statement={bind(...values:any[]){args=values;return statement;},async first(){await Promise.resolve();return sql.prepare(query).get(...args)??null;},async run(){await Promise.resolve();const result=sql.prepare(query).run(...args);writes++;if(ambiguous&&query.startsWith('UPDATE')){ambiguous=false;throw Error('unknown commit outcome');}return {meta:{changes:Number(result.changes)}};}};return statement;}};
  const env={DB} as HostedEnv;
  async function request(path='/api/state',body?:unknown,cookie?:string,headers:Record<string,string>={}){
    return handleHosted(new Request(origin+path,{method:body===undefined?'GET':'POST',headers:{...(body===undefined?{}:{Origin:origin,'Content-Type':'application/json'}),...(cookie?{Cookie:cookie}:{}),...headers},...(body===undefined?{}:{body:JSON.stringify(body)})}),env,()=>now);
  }
  return {sql,env,request,advance:(ms:number)=>{now+=ms;},setAmbiguous:()=>{ambiguous=true;},writes:()=>writes};
}
async function session(f:ReturnType<typeof fixture>){const response=await f.request();assert.equal(response.status,200);return response.headers.get('Set-Cookie')!.split(';')[0]!;}
test('hosted session survives separate handler calls and protects private state',async()=>{
 const f=fixture(),cookie=await session(f);assert.match(cookie,/^__Host-ghost-protocol-session=[a-f0-9]{64}$/);
 assert.deepEqual(await(await f.request('/api/transport')).json(),{type:'http'});
 const response=await f.request();assert.match(response.headers.get('Set-Cookie')!,/Secure/);
 await f.request('/api/command',{type:'start'},cookie);f.advance(660);
 const state=await(await f.request('/api/state',undefined,cookie)).json() as any;
 assert.equal(state.status,'playing');assert.equal(state.elapsedMs,660);assert(!('holders'in state));assert(!('playerClockMs'in state));
 const other=await(await f.request()).json() as any;assert.equal(other.status,'title');assert.notEqual(other.runId,state.runId);f.sql.close();
});
test('hosted origin, cookie and command input fail closed',async()=>{
 const f=fixture(),cookie=await session(f);
 assert.equal((await f.request('/api/command',{type:'start'},cookie,{Origin:'https://evil.test'})).status,403);
 assert.equal((await f.request('/api/state',undefined,cookie,{'Sec-Fetch-Site':'cross-site'})).status,403);
 assert.equal((await f.request('/api/command',{type:'start'},cookie+'; '+cookie)).status,401);
 assert.equal((await f.request('/api/command',{type:'move',direction:'east',actor:'admin'},cookie)).status,400);
 assert.equal((await f.request('/api/command',{type:'start',noise:'x'.repeat(2100)},cookie)).status,413);
 assert.equal((await f.request('/api/nope')).status,404);f.sql.close();
});
test('hosted clock uses real elapsed time and pauses through a bounded disconnect grace',async()=>{
 const f=fixture(),cookie=await session(f);await f.request('/api/command',{type:'start'},cookie);
 f.advance(800);let state=await(await f.request('/api/state',undefined,cookie)).json() as any;assert.equal(state.elapsedMs,800);
 f.advance(-300);state=await(await f.request('/api/state',undefined,cookie)).json() as any;assert.equal(state.elapsedMs,800);
 f.advance(10_000);state=await(await f.request('/api/state',undefined,cookie)).json() as any;assert.equal(state.status,'paused');assert.equal(state.elapsedMs,2800);
 await f.request('/api/command',{type:'resume'},cookie);f.advance(360);state=await(await f.request('/api/state',undefined,cookie)).json() as any;assert.equal(state.status,'playing');assert.equal(state.elapsedMs,3160);f.sql.close();
});
test('concurrent requests use compare-and-swap without double advancing the clock',async()=>{
 const f=fixture(),cookie=await session(f);await f.request('/api/command',{type:'start'},cookie);f.advance(180);
 const responses=await Promise.all([f.request('/api/state',undefined,cookie),f.request('/api/command',{type:'move',direction:'east'},cookie)]);
 assert(responses.every(r=>r.status===200));let state=await(await f.request('/api/state',undefined,cookie)).json() as any;assert.equal(state.elapsedMs,180);assert.equal(state.queuedDirection,'east');
 f.advance(180);state=await(await f.request('/api/state',undefined,cookie)).json() as any;assert.deepEqual(state.player,{x:2,z:11});assert.equal(state.elapsedMs,360);f.sql.close();
});
test('expired sessions reset and ambiguous commits are never replayed automatically',async()=>{
 const f=fixture(),cookie=await session(f);await f.request('/api/command',{type:'start'},cookie);
 f.setAmbiguous();assert.equal((await f.request('/api/command',{type:'pause'},cookie)).status,503);
 assert.equal((await(await f.request('/api/state',undefined,cookie)).json() as any).status,'paused');
 f.advance(6*60*60*1000+1);assert.equal((await f.request('/api/command',{type:'resume'},cookie)).status,401);assert.equal((await(await f.request('/api/state',undefined,cookie)).json() as any).status,'title');f.sql.close();
});
