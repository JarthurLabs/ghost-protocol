import test from 'node:test';
import assert from 'node:assert/strict';
import { request as httpRequest } from 'node:http';
import { createGameServer } from '../server/index.js';

test('public hosting pins Host and Origin and issues a Secure session cookie',async()=>{
 const origin='https://ghost-protocol.example',server=createGameServer({publicOrigin:origin,realtime:true});let base='';
 try{
  for(const port of [5325,5324,5323,5326,5327,5328,5329]){
   try{await new Promise<void>((resolve,reject)=>{const error=(e:Error)=>{server.off('listening',ready);reject(e);};const ready=()=>{server.off('error',error);resolve();};server.once('error',error);server.once('listening',ready);server.listen(port,'127.0.0.1');});base=`http://127.0.0.1:${port}`;break;}
   catch(e){if((e as NodeJS.ErrnoException).code!=='EADDRINUSE')throw e;}
  }
  assert(base);
  async function call(path:string,headers:Record<string,string>,body?:string){return new Promise<{status:number;headers:Record<string,any>;body:any}>((resolve,reject)=>{
   const request=httpRequest(base+path,{method:body?'POST':'GET',headers},response=>{const data:Buffer[]=[];response.on('data',chunk=>data.push(chunk));response.on('end',()=>resolve({status:response.statusCode!,headers:response.headers,body:JSON.parse(Buffer.concat(data).toString())}));});request.on('error',reject);request.end(body);
  });}
  const valid={Host:'ghost-protocol.example',Origin:origin};
  assert.equal((await call('/api/state',{Host:'evil.example','X-Forwarded-Host':'ghost-protocol.example'})).status,403);
  const initial=await call('/api/state',valid);assert.equal(initial.status,200);
  const cookie=initial.headers['set-cookie'][0];assert.match(cookie,/; Secure/);assert.match(cookie,/HttpOnly/);
  const commandHeaders={...valid,Cookie:cookie.split(';')[0],'Content-Type':'application/json'};
  assert.equal((await call('/api/command',{...commandHeaders,Origin:'https://evil.example'},'{"type":"start"}')).status,403);
  assert.equal((await call('/api/command',commandHeaders,'{"type":"start"}')).body.status,'playing');
 }finally{await new Promise<void>(resolve=>server.close(()=>resolve()));}
});
test('public server startup refuses an unpinned or insecure origin',()=>{
 for(const publicOrigin of ['http://ghost-protocol.example','https://ghost-protocol.example/path','https://name:secret@ghost-protocol.example','https://ghost-protocol.example/'])assert.throws(()=>createGameServer({publicOrigin}));
});
