import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { setTimeout as delay } from 'node:timers/promises';
import { WebSocket } from 'ws';
import { request as httpRequest } from 'node:http';
import { createGameServer } from '../server/index.js';
import type { GameState } from '../shared/types.js';
import { LiveGameConnection } from '../src/liveConnection.js';
import { discoverTransport } from '../src/transportBootstrap.js';

const server = createGameServer({realtime:true});
let base='';
const sockets=new Set<WebSocket>();
before(async()=>{
 for(const port of [5327,5326,5325,5324,5323,5322,5328,5329]){
  try{await new Promise<void>((resolve,reject)=>{const error=(e:Error)=>{server.off('listening',ready);reject(e);};const ready=()=>{server.off('error',error);resolve();};server.once('error',error);server.once('listening',ready);server.listen(port,'127.0.0.1');});base=`http://127.0.0.1:${port}`;return;}
  catch(e){if((e as NodeJS.ErrnoException).code!=='EADDRINUSE')throw e;}
 }
 throw Error('No free game test port.');
});
after(async()=>{for(const socket of sockets)socket.terminate();await new Promise<void>(resolve=>server.close(()=>resolve()));});
async function session(){const response=await fetch(base+'/api/state');return {cookie:response.headers.get('set-cookie')!.split(';')[0]!,state:await response.json() as GameState};}
async function connect(cookie:string,origin=base){
 const socket=new WebSocket(base.replace('http:','ws:')+'/api/live',{headers:{Cookie:cookie,Origin:origin}});sockets.add(socket);
 const frames:any[]=[];socket.on('message',data=>frames.push(JSON.parse(String(data))));
 await new Promise<void>((resolve,reject)=>{socket.once('open',resolve);socket.once('error',reject);});
 let id=0;
 async function until(check:(frame:any)=>boolean,ms=2000){const end=performance.now()+ms;while(performance.now()<end){const frame=frames.find(check);if(frame)return frame;await delay(5);}throw Error('Socket response timed out.');}
 await until(frame=>frame.kind==='state');
 return {socket,frames,until,send:async(command:unknown)=>{const n=++id;socket.send(JSON.stringify({kind:'command',id:n,command}));return until(frame=>frame.id===n);}};
}
async function rejected(cookie:string,origin:string){
 const socket=new WebSocket(base.replace('http:','ws:')+'/api/live',{headers:{Cookie:cookie,Origin:origin}});sockets.add(socket);
 return new Promise<number>((resolve,reject)=>{socket.once('unexpected-response',(_,response)=>{response.resume();socket.terminate();resolve(response.statusCode!);});socket.on('error',()=>{});socket.once('open',()=>reject(Error('Unauthorized socket accepted')));});
}

test('realtime mode advertises a live connection without changing the approved local default',async()=>{
 assert.equal((await fetch(base+'/api/transport')).status,200);
 assert.deepEqual(await (await fetch(base+'/api/transport')).json(),{type:'websocket',controllerAvailable:true});
});
test('reload can check controller release without attempting a conflicting socket',async()=>{
 const a=await session(),client=await connect(a.cookie);
 const transport=()=>fetch(base+'/api/transport',{headers:{Cookie:a.cookie,Origin:base}});
 assert.equal((await (await transport()).json()).controllerAvailable,false);
 const foreign=await fetch(base+'/api/transport',{headers:{Cookie:a.cookie,Origin:'https://example.invalid'}});
 assert.equal(foreign.status,403);
 client.socket.close();await new Promise<void>(resolve=>client.socket.once('close',()=>resolve()));
 assert.equal((await (await transport()).json()).controllerAvailable,true);
 const replacement=await connect(a.cookie);replacement.socket.close();
});
test('socket identity is same-origin and a second controller cannot fork an attempt',async()=>{
 const a=await session();
 assert.equal(await rejected('',base),401);
 assert.equal(await rejected(a.cookie,'https://example.invalid'),403);
 const client=await connect(a.cookie);
 assert.equal(await rejected(a.cookie,base),409);
 const response=await fetch(base+'/api/command',{method:'POST',headers:{Cookie:a.cookie,Origin:base,'Content-Type':'application/json'},body:'{"type":"start"}'});
 assert.equal(response.status,409);
 client.socket.close();
});
test('reload bootstrap waits for socket release and cancellation leaves the current controller intact',async()=>{
 const a=await session(),client=await connect(a.cookie);
 const request:typeof fetch=(url,options)=>fetch(base+String(url),{...options,headers:{Cookie:a.cookie,Origin:base}});
 const cancelled=new AbortController();
 const waiting=discoverTransport(cancelled.signal,request);
 await delay(80);cancelled.abort(Error('Page left'));
 await assert.rejects(waiting,/Page left/);
 assert.equal((await client.send({type:'start'})).state.status,'playing');
 let ready=false;
 const reloading=discoverTransport(new AbortController().signal,request).then(value=>{ready=true;return value;});
 await delay(80);assert.equal(ready,false,'A reload must not race the still-owned socket');
 client.socket.close();
 assert.equal((await reloading).controllerAvailable,true);
 const replacement=await connect(a.cookie);
 assert.equal(replacement.frames.find(f=>f.kind==='state').state.status,'paused');
 replacement.socket.close();
});
test('ordered socket commands preserve server authorization and reject duplicate actions',async()=>{
 const a=await session(),b=await session(),client=await connect(a.cookie);
 const started=await client.send({type:'start'});assert.equal(started.state.status,'playing');
 const paused=await client.send({type:'pause'});assert.equal(paused.state.status,'paused');
 const forged=await client.send({type:'wait',position:{x:100,z:100},status:'won'});assert.equal(forged.kind,'error');
 const before=JSON.parse(JSON.stringify(client.frames.filter(f=>f.state).at(-1).state));
 client.socket.send(JSON.stringify({kind:'command',id:2,command:{type:'restart'}}));
 await client.until(f=>f.kind==='error'&&f.code==='sequence');
 const current=await (await fetch(base+'/api/state',{headers:{Cookie:a.cookie}})).json();assert.deepEqual(current,before);
 const other=await (await fetch(base+'/api/state',{headers:{Cookie:b.cookie}})).json();assert.equal(other.status,'title');
 for(const field of ['holders','playerClockMs','sentryClockMs','patrolIndex','extractionHoldMs'])assert.equal(field in started.state,false);
 client.socket.close();
});
test('reload bootstrap recovers when the old connection disappears without a close frame',async()=>{
 const a=await session(),client=await connect(a.cookie);await client.send({type:'start'});
 const request:typeof fetch=(url,options)=>fetch(base+String(url),{...options,headers:{Cookie:a.cookie,Origin:base}});
 const transport=await discoverTransport(new AbortController().signal,request);
 assert.equal(transport.controllerAvailable,true);
 const replacement=await connect(a.cookie);
 assert.equal(replacement.frames.find(f=>f.kind==='state').state.status,'paused');
 assert.equal((await replacement.send({type:'resume'})).state.status,'playing');
 replacement.socket.close();
});
test('a second tab times out without taking over a live controller',async()=>{
 const a=await session(),client=await connect(a.cookie);
 const heartbeat=setInterval(()=>{if(client.socket.readyState===1)client.socket.send('{"kind":"heartbeat"}');},500);
 const request:typeof fetch=(url,options)=>fetch(base+String(url),{...options,headers:{Cookie:a.cookie,Origin:base}});
 try{
  await assert.rejects(discoverTransport(new AbortController().signal,request),/Another game connection is still active/);
  assert.equal((await client.send({type:'start'})).state.status,'playing');
 }finally{clearInterval(heartbeat);client.socket.close();}
});
test('socket pushes independent patrol updates and close pauses before reconnect',async()=>{
 const a=await session(),client=await connect(a.cookie);const started=await client.send({type:'start'});
 const moving=await client.until(f=>f.kind==='state'&&f.state.elapsedMs>=400);
 assert.notDeepEqual(moving.state.sentries,started.state.sentries);assert.deepEqual(moving.state.player,started.state.player);
 client.socket.close();await new Promise<void>(resolve=>client.socket.once('close',()=>resolve()));await delay(80);
 const resumed=await connect(a.cookie);const initial=resumed.frames.find(f=>f.kind==='state').state;assert.equal(initial.status,'paused');
 await delay(200);const now=await (await fetch(base+'/api/state',{headers:{Cookie:a.cookie}})).json();assert.equal(now.elapsedMs,initial.elapsedMs);
 const command=await resumed.send({type:'resume'});assert.equal(command.state.status,'playing');resumed.socket.close();
});
test('missing heartbeat closes the controller and pauses the server clock',async()=>{
 const a=await session(),client=await connect(a.cookie);await client.send({type:'start'});
 await new Promise<void>((resolve,reject)=>{const timer=setTimeout(()=>reject(Error('Heartbeat never expired')),3500);client.socket.once('close',()=>{clearTimeout(timer);resolve();});});
 const state=await (await fetch(base+'/api/state',{headers:{Cookie:a.cookie}})).json();assert.equal(state.status,'paused');assert.ok(state.elapsedMs<=2100);
});
test('an HTTP body begun before socket ownership cannot mutate the connected attempt',async()=>{
 const a=await session();let status:Promise<number>;
 const request=httpRequest(base+'/api/command',{method:'POST',headers:{Cookie:a.cookie,Origin:base,'Content-Type':'application/json'}});
 status=new Promise((resolve,reject)=>{request.on('response',r=>{r.resume();resolve(r.statusCode!);});request.on('error',reject);});
 request.write('{"type":');await delay(50);
 const client=await connect(a.cookie);request.end('"start"}');assert.equal(await status,409);
 assert.equal((await (await fetch(base+'/api/state',{headers:{Cookie:a.cookie}})).json()).status,'title');client.socket.close();
});
test('browser transport receives ordered acknowledgements and keeps an idle connection alive',async()=>{
 const a=await session(),states:GameState[]=[],errors:string[]=[];
 const connection=new LiveGameConnection(base.replace('http:','ws:')+'/api/live',s=>states.push(s),s=>errors.push(s),url=>{
  const socket=new WebSocket(url,{headers:{Cookie:a.cookie,Origin:base}});sockets.add(socket);return socket as unknown as globalThis.WebSocket;
 });
 try{
  await connection.ready();assert.equal(states[0]!.status,'title');
  const [start,pause]=await Promise.all([connection.command({type:'start'}),connection.command({type:'pause'})]);assert.equal(start.status,'playing');assert.equal(pause.status,'paused');
  await delay(2500);assert.equal((await connection.command({type:'resume'})).status,'playing');assert.deepEqual(errors,[]);
 }finally{connection.close();}
});
test('server shutdown completes while an active client keeps sending heartbeats',async()=>{
 const a=await session(),client=await connect(a.cookie);await client.send({type:'start'});
 const heartbeat=setInterval(()=>{if(client.socket.readyState===1)client.socket.send('{"kind":"heartbeat"}');},500);
 try{await new Promise<void>((resolve,reject)=>{
  const deadline=setTimeout(()=>{client.socket.terminate();reject(Error('Server shutdown waited for the live client.'));},1500);
  server.close(error=>{clearTimeout(deadline);error?reject(error):resolve();});
 });}finally{clearInterval(heartbeat);client.socket.terminate();}
});
