import { advanceGame, applyCommand, CommandError, createGame, snapshot, type EngineState } from '../server/engine.js';

export const PUBLIC_ORIGIN='https://ghost-protocol.jamalarthur1.chatgpt.site';
const COOKIE='__Host-ghost-protocol-session',LIFETIME=6*60*60*1000,GRACE=2000,SCHEMA=1;
interface Statement {bind(...args:(string|number)[]):Statement;first<T=Record<string,unknown>>():Promise<T|null>;run():Promise<{meta:{changes:number}}>}
export interface HostedEnv {DB:{prepare(query:string):Statement};ASSETS?:{fetch(request:Request):Promise<Response>}}
interface Row {session_id:string;engine_json:string;engine_version:number;revision:number;expires_at:number;last_seen_at:number;last_tick_at:number}
class HttpError extends Error {constructor(public status:number,message:string){super(message);}}
const headers={'Cache-Control':'no-store','Content-Type':'application/json; charset=utf-8','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer'};
function json(value:unknown,status=200,cookie?:string){return new Response(JSON.stringify(value),{status,headers:{...headers,...(cookie?{'Set-Cookie':cookie}:{})}});}
function identity(request:Request){
 const cookies=(request.headers.get('Cookie')??'').split(';').map(s=>s.trim()).filter(s=>s.startsWith(COOKIE+'='));
 if(cookies.length!==1)return null;const value=cookies[0]!.slice(COOKIE.length+1);return /^[a-f0-9]{64}$/.test(value)?value:null;
}
function checkOrigin(request:Request,required:boolean){
 const origin=request.headers.get('Origin'),site=request.headers.get('Sec-Fetch-Site');
 if((required&&!origin)||(origin!==null&&origin!==PUBLIC_ORIGIN)||(site!==null&&!['same-origin','none'].includes(site)))throw new HttpError(403,'A same-origin game request is required.');
}
async function commandBody(request:Request){
 if(!/^application\/json(?:\s*;|$)/i.test(request.headers.get('Content-Type')??''))throw new HttpError(415,'Commands require application/json.');
 if(Number(request.headers.get('Content-Length')??0)>2048)throw new HttpError(413,'Command body is too large.');
 const reader=request.body?.getReader();if(!reader)throw new HttpError(400,'A command is required.');
 const parts:Uint8Array[]=[];let size=0;
 try{while(true){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>2048){await reader.cancel();throw new HttpError(413,'Command body is too large.');}parts.push(value);}}finally{reader.releaseLock();}
 const bytes=new Uint8Array(size);let offset=0;for(const part of parts){bytes.set(part,offset);offset+=part.length;}
 try{return JSON.parse(new TextDecoder().decode(bytes));}catch{throw new HttpError(400,'Malformed JSON command.');}
}
function tick(row:Row,game:EngineState,now:number){
 const current=Math.max(now,row.last_tick_at),deadline=row.last_seen_at+GRACE;
 const delta=Math.max(0,Math.min(current,deadline)-row.last_tick_at);
 if(game.status==='playing'&&delta>0)advanceGame(game,delta);
 if(game.status==='playing'&&current>deadline){applyCommand(game,{type:'pause'});game.message='Connection paused. Resume when you are ready to run the maze.';}
 row.last_seen_at=Math.max(now,row.last_seen_at);row.last_tick_at=current;
}
async function createSession(env:HostedEnv,now:number){
 const bytes=crypto.getRandomValues(new Uint8Array(32)),id=Array.from(bytes,b=>b.toString(16).padStart(2,'0')).join('');
 const game=createGame();
 await env.DB.prepare('DELETE FROM gp_sessions WHERE expires_at <= ? OR engine_version != ?').bind(now,SCHEMA).run();
 const inserted=await env.DB.prepare('INSERT INTO gp_sessions (session_id,engine_json,engine_version,revision,expires_at,last_seen_at,last_tick_at) SELECT ?,?,?,0,?,?,? WHERE (SELECT COUNT(*) FROM gp_sessions) < 4096')
  .bind(id,JSON.stringify(game),SCHEMA,now+LIFETIME,now,now).run();
 if(inserted.meta.changes!==1)throw new HttpError(503,'The game is busy. Please try again shortly.');
 return json(snapshot(game),200,`${COOKIE}=${id}; Path=/; Secure; HttpOnly; SameSite=Strict; Max-Age=21600`);
}
async function sessionRequest(request:Request,env:HostedEnv,now:number,input?:unknown){
 const id=identity(request),isCommand=request.method==='POST';
 for(let attempt=0;attempt<5;attempt++){
  const row=id?await env.DB.prepare('SELECT * FROM gp_sessions WHERE session_id = ? AND expires_at > ? AND engine_version = ?').bind(id,now,SCHEMA).first<Row>():null;
  if(!row){if(isCommand)throw new HttpError(401,'Your game session expired. Reload to start a new session.');return createSession(env,now);}
  const game=JSON.parse(row.engine_json) as EngineState;
  // Idle screens have no running clock. A read needs no heartbeat write.
  if(!isCommand&&game.status!=='playing')return json(snapshot(game));
  tick(row,game,now);
  if(isCommand)applyCommand(game,input);
  const result=await env.DB.prepare('UPDATE gp_sessions SET engine_json = ?, revision = revision + 1, last_seen_at = ?, last_tick_at = ? WHERE session_id = ? AND revision = ? AND expires_at > ?')
   .bind(JSON.stringify(game),row.last_seen_at,row.last_tick_at,row.session_id,row.revision,now).run();
  if(result.meta.changes===1)return json(snapshot(game));
  // A definite version conflict is safe to recompute. An ambiguous database
  // failure escapes immediately; it must never replay an already committed command.
 }
 throw new HttpError(503,'The session is busy. Please try your action again.');
}
export async function handleHosted(request:Request,env:HostedEnv,clock:()=>number=Date.now):Promise<Response>{
 try{
  const url=new URL(request.url);
  if(url.origin!==PUBLIC_ORIGIN)throw new HttpError(403,'This host does not serve Ghost Protocol.');
  if(url.pathname==='/api/health'&&request.method==='GET')return json({game:'ghost-protocol',runtime:'hosted',approvedGame:'e3ad76c'});
  if(url.pathname==='/api/transport'&&request.method==='GET')return json({type:'http'});
  if(url.pathname==='/api/state'&&request.method==='GET'){checkOrigin(request,false);return await sessionRequest(request,env,clock());}
  if(url.pathname==='/api/command'&&request.method==='POST'){checkOrigin(request,true);const input=await commandBody(request);return await sessionRequest(request,env,clock(),input);}
  if(url.pathname.startsWith('/api/'))throw new HttpError(404,'Unknown API route or method.');
  if(!['GET','HEAD'].includes(request.method))throw new HttpError(405,'Method not allowed.');
  if(!env.ASSETS)throw new HttpError(503,'The game assets are temporarily unavailable.');
  const response=await env.ASSETS.fetch(request),result=new Response(response.body,response);
  result.headers.set('X-Content-Type-Options','nosniff');result.headers.set('Referrer-Policy','no-referrer');
  result.headers.set('Content-Security-Policy',"default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; connect-src 'self'; media-src 'self' blob:; font-src 'self'; object-src 'none'; frame-ancestors 'none'; base-uri 'none'");
  result.headers.set('Cache-Control',url.pathname.startsWith('/assets/')?'public, max-age=31536000, immutable':'no-store');return result;
 }catch(error){
  if(error instanceof HttpError)return json({error:error.message},error.status);
  if(error instanceof CommandError)return json({error:error.message},400);
  return json({error:'The game connection is temporarily unavailable. Please try again.'},503);
 }
}
export default {fetch:(request:Request,env:HostedEnv)=>handleHosted(request,env)};
