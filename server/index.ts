import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { randomBytes } from 'node:crypto';
import { readFile, stat } from 'node:fs/promises';
import { dirname, extname, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { advanceGame, applyCommand, CommandError, createGame, snapshot, type EngineState } from './engine.js';
import { WebSocket, WebSocketServer } from 'ws';

const COOKIE = 'ghost-protocol-session';
const SESSION_LIFETIME = 6 * 60 * 60 * 1000;
const MAX_BODY_BYTES = 2048;
const defaultDist = resolve(dirname(fileURLToPath(import.meta.url)), '../dist');
interface Session { game: EngineState; expiresAt: number; lastSeenAt: number; lastTickAt: number; socket?: WebSocket; socketSequence?: number }
interface ServerOptions { production?: boolean; distDirectory?: string; realtime?: boolean; publicOrigin?: string }
class RequestError extends Error { constructor(public status: number, message: string) { super(message); } }

export function readPort(value: string | undefined, production: boolean): number {
  if (value === undefined) return production ? 5320 : 5321;
  if (!/^532[0-9]$/.test(value)) throw new Error('Ghost Protocol ports must be in the reserved range 5320–5329.');
  return Number(value);
}

function json(response: ServerResponse, status: number, value: unknown) {
  response.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  response.end(JSON.stringify(value));
}

function requestHost(request: IncomingMessage, publicOrigin?: string): string {
  const host = request.headers.host?.toLowerCase();
  if(publicOrigin){if(host!==new URL(publicOrigin).host)throw new RequestError(403,'This host does not serve Ghost Protocol.');return host;}
  if (!host || !/^(127\.0\.0\.1|localhost|\[::1\]):532[0-9]$/.test(host)) {
    throw new RequestError(403, 'Only this game’s loopback host is accepted.');
  }
  return host;
}

function sameOrigin(request: IncomingMessage, host: string, required: boolean, publicOrigin?: string) {
  const origin = request.headers.origin;
  const site = request.headers['sec-fetch-site'];
  if ((required && !origin) || (origin !== undefined && origin !== (publicOrigin??`http://${host}`)) ||
      (site !== undefined && site !== 'same-origin' && site !== 'none')) {
    throw new RequestError(403, 'A same-origin request is required.');
  }
}

function sessionId(request: IncomingMessage): string | null {
  const matches = (request.headers.cookie ?? '').split(';').map(part => part.trim())
    .filter(part => part.startsWith(`${COOKIE}=`));
  if (matches.length !== 1) return null;
  const value = matches[0]!.slice(COOKIE.length + 1);
  return /^[a-f0-9]{64}$/.test(value) ? value : null;
}

async function commandBody(request: IncomingMessage): Promise<unknown> {
  if (!/^application\/json(?:\s*;|$)/i.test(request.headers['content-type'] ?? '')) {
    throw new RequestError(415, 'Commands require application/json.');
  }
  const declared = Number(request.headers['content-length'] ?? 0);
  if (declared > MAX_BODY_BYTES) { request.resume(); throw new RequestError(413, 'Command body is too large.'); }
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > MAX_BODY_BYTES) throw new RequestError(413, 'Command body is too large.');
    chunks.push(Buffer.from(chunk));
  }
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8')); }
  catch { throw new RequestError(400, 'Malformed JSON command.'); }
}

const mime: Record<string, string> = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.svg': 'image/svg+xml',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp',
  '.ico': 'image/x-icon', '.woff2': 'font/woff2', '.mp4': 'video/mp4', '.webm': 'video/webm', '.mp3': 'audio/mpeg',
};

async function serveFrontend(pathname: string, request: IncomingMessage, response: ServerResponse, dist: string, socketOrigin?:string) {
  if (request.method !== 'GET' && request.method !== 'HEAD') throw new RequestError(405, 'Method not allowed.');
  let decoded: string;
  try { decoded = decodeURIComponent(pathname); }
  catch { throw new RequestError(400, 'Invalid path.'); }
  const relative = decoded === '/' ? 'index.html' : decoded.slice(1);
  if (relative.split('/').some(part => part.startsWith('.')) || relative.includes('\0')) throw new RequestError(404, 'Not found.');
  const file = resolve(dist, relative);
  if (!file.startsWith(`${dist}${sep}`)) throw new RequestError(404, 'Not found.');
  try {
    if (!(await stat(file)).isFile()) throw new RequestError(404, 'Not found.');
    const body = await readFile(file);
    response.writeHead(200, {
      'Content-Type': mime[extname(file)] ?? 'application/octet-stream',
      'Cache-Control': relative.startsWith('assets/') ? 'public, max-age=31536000, immutable' : 'no-store',
      'Content-Length': body.length,
      'Content-Security-Policy': `default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; connect-src 'self'${socketOrigin?' '+socketOrigin:''}; media-src 'self' blob:; font-src 'self'; object-src 'none'; frame-ancestors 'none'; base-uri 'none'`,
    });
    response.end(request.method === 'HEAD' ? undefined : body);
  } catch (error) {
    if (error instanceof RequestError) throw error;
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') throw new RequestError(404, 'Built frontend not found. Run npm run build first.');
    throw error;
  }
}

/** Local sessions own their engines; no body field can choose an actor or state. */
export function createGameServer(options: ServerOptions = {}) {
  if(options.publicOrigin){const u=new URL(options.publicOrigin);if(u.protocol!=='https:'||u.origin!==options.publicOrigin||u.username||u.password)throw Error('Public game origin must be an exact HTTPS origin.');}
  const production = options.production ?? process.env.NODE_ENV === 'production';
  const dist = resolve(options.distDirectory ?? defaultDist);
  const sessions = new Map<string, Session>();

  function findSession(request: IncomingMessage): Session | undefined {
    const id = sessionId(request);
    const entry = id ? sessions.get(id) : undefined;
    if (!entry || entry.expiresAt <= Date.now()) {
      if (id) sessions.delete(id);
      return undefined;
    }
    return entry;
  }

  const server = createServer({ requestTimeout: 10_000, headersTimeout: 10_000 }, async (request, response) => {
    response.setHeader('X-Content-Type-Options', 'nosniff');
    response.setHeader('Referrer-Policy', 'no-referrer');
    response.setHeader('X-Frame-Options', 'DENY');
    try {
      const host = requestHost(request,options.publicOrigin);
      const pathname = new URL(request.url ?? '/', `http://${host}`).pathname;
      if (pathname === '/api/health' && request.method === 'GET') return json(response, 200, { game: 'ghost-protocol' });
      if (pathname === '/api/transport' && request.method === 'GET') {
        sameOrigin(request,host,false,options.publicOrigin);
        return json(response,200,options.realtime
          ? {type:'websocket',controllerAvailable:!findSession(request)?.socket}
          : {type:'http'});
      }
      if (pathname === '/api/state' && request.method === 'GET') {
        sameOrigin(request, host, false,options.publicOrigin);
        let session = findSession(request);
        if (!session) {
          for (const [id, value] of sessions) if (value.expiresAt <= Date.now()) sessions.delete(id);
          if (sessions.size >= 256) throw new RequestError(503, 'Local session limit reached. Restart this game’s server to clear sessions.');
          const id = randomBytes(32).toString('hex');
          const now = performance.now();
          session = { game: createGame(), expiresAt: Date.now() + SESSION_LIFETIME, lastSeenAt: now, lastTickAt: now };
          sessions.set(id, session);
          response.setHeader('Set-Cookie', `${COOKIE}=${id}; Path=/; HttpOnly; SameSite=Strict; Max-Age=21600${options.publicOrigin?'; Secure':''}`);
        }
        if(!session.socket)session.lastSeenAt = performance.now();
        return json(response, 200, snapshot(session.game));
      }
      if (pathname === '/api/command' && request.method === 'POST') {
        sameOrigin(request, host, true,options.publicOrigin);
        const session = findSession(request);
        if (!session) throw new RequestError(401, 'Game session missing or expired. Reload to begin a local session.');
        if(session.socket)throw new RequestError(409,'This attempt is controlled by its live connection.');
        const input = await commandBody(request);
        if(findSession(request)!==session)throw new RequestError(401,'Game session expired.');
        if(session.socket)throw new RequestError(409,'This attempt is controlled by its live connection.');
        // No await between authorization and commit inside applyCommand.
        const previousStatus = session.game.status;
        const result = applyCommand(session.game, input);
        session.lastSeenAt = performance.now();
        if (session.game.status === 'playing' && previousStatus !== 'playing') session.lastTickAt = session.lastSeenAt;
        return json(response, 200, result);
      }
      if (pathname.startsWith('/api/')) throw new RequestError(404, 'Unknown API route or method.');
      if (production) return await serveFrontend(pathname, request, response, dist,options.realtime?(options.publicOrigin??`http://${host}`).replace(/^http/,'ws'):undefined);
      throw new RequestError(404, 'Open Ghost Protocol’s Vite preview to play.');
    } catch (error) {
      if (response.headersSent || response.destroyed) return;
      if (error instanceof RequestError) return json(response, error.status, { error: error.message });
      if (error instanceof CommandError) return json(response, 400, { error: error.message });
      console.error('Ghost Protocol request failed:', error instanceof Error ? error.message : 'unknown error');
      return json(response, 500, { error: 'The local game could not process this request.' });
    }
  });

  function push(session:Session,kind='state',id?:number,error?:string,code?:string){
    const socket=session.socket;if(!socket||socket.readyState!==WebSocket.OPEN)return;
    if(socket.bufferedAmount>256*1024){socket.terminate();return;}
    socket.send(JSON.stringify({kind,seq:session.socketSequence=(session.socketSequence??0)+1,...(id===undefined?{}:{id}),...(kind==='heartbeat'?{}:error?{error,code}:{state:snapshot(session.game)})}));
  }
  const live=options.realtime?new WebSocketServer({noServer:true,maxPayload:2048,perMessageDeflate:{serverNoContextTakeover:true,clientNoContextTakeover:true,concurrencyLimit:4,threshold:1024}}):undefined;
  if(live)server.on('upgrade',(request,socket,head)=>{
    try{
      const host=requestHost(request,options.publicOrigin);sameOrigin(request,host,true,options.publicOrigin);
      if(request.url!=='/api/live')throw new RequestError(404,'Unknown live connection.');
      const session=findSession(request);if(!session)throw new RequestError(401,'Game session required.');
      if(session.socket)throw new RequestError(409,'This attempt already has a controller.');
      if(live.clients.size>=32)throw new RequestError(503,'The game is busy. Try again shortly.');
      live.handleUpgrade(request,socket,head,ws=>{
        session.socket=ws;session.socketSequence=0;session.lastSeenAt=performance.now();let nextId=1,windowStart=performance.now(),count=0;
        const detach=()=>{if(session.socket!==ws)return;session.socket=undefined;if(session.game.status==='playing'){applyCommand(session.game,{type:'pause'});session.game.message='Connection paused. Resume when you are ready to run the maze.';}};
        ws.on('error',()=>{detach();ws.terminate();});ws.on('close',detach);
        ws.on('message',(raw,binary)=>{
          if(session.socket!==ws)return;
          const now=performance.now();if(now-windowStart>=1000){windowStart=now;count=0;}
          if(++count>60||binary||session.expiresAt<=Date.now()){detach();ws.close(1008,'Connection limit reached.');return;}
          let value:any;try{value=JSON.parse(String(raw));}catch{detach();ws.close(1008,'Invalid command.');return;}
          if(value?.kind==='heartbeat'&&Object.keys(value).length===1){session.lastSeenAt=now;push(session,'heartbeat');return;}
          if(!value||value.kind!=='command'||Object.keys(value).sort().join(',')!=='command,id,kind'||!Number.isSafeInteger(value.id)||value.id<1){detach();ws.close(1008,'Invalid command.');return;}
          if(value.id!==nextId){push(session,'error',value.id,'An input arrived out of order. Reconnect to continue.','sequence');return;}
          nextId++;session.lastSeenAt=now;
          try{
            const previous=session.game.status;applyCommand(session.game,value.command);
            if(session.game.status==='playing'&&previous!=='playing')session.lastTickAt=now;
            push(session,'ack',value.id);
          }catch(error){push(session,'error',value.id,error instanceof CommandError?error.message:'The action could not be applied.','command');}
        });
        push(session);
      });
    }catch(error){const status=error instanceof RequestError?error.status:500;socket.end(`HTTP/1.1 ${status} Connection Rejected\r\nConnection: close\r\nContent-Length: 0\r\n\r\n`);}
  });

  // One monotonic wall clock drives every session independently of requests.
  // A disconnected browser gets a short grace window, then a genuine pause.
  const timer = setInterval(() => {
    const now = performance.now();
    for (const [id, session] of sessions) {
      if (session.expiresAt <= Date.now()) { session.socket?.close(1008,'Session expired.');sessions.delete(id); continue; }
      const connectedUntil = session.lastSeenAt + 2000;
      const wasPlaying=session.game.status==='playing';
      const delta = Math.max(0, Math.min(now, connectedUntil) - session.lastTickAt);
      session.lastTickAt = now;
      // Do not convert an operating-system stall into an unavoidable catch-up capture.
      if (delta > 0 && session.game.status === 'playing') advanceGame(session.game, Math.min(delta, 250));
      if (now > connectedUntil && session.game.status === 'playing') {
        applyCommand(session.game, { type: 'pause' });
        session.game.message = 'Connection paused. Resume when you are ready to run the maze.';
      }
      if(session.socket&&now>connectedUntil){const socket=session.socket;session.socket=undefined;socket.close(4000,'Heartbeat expired.');}
      else if(session.socket&&(wasPlaying||session.game.status==='playing'))push(session);
    }
  }, 50);
  timer.unref();
  const closeHttp=server.close.bind(server);
  server.close=(callback?:Parameters<typeof server.close>[0])=>{
    clearInterval(timer);
    for(const session of sessions.values()){
      if(session.game.status==='playing')applyCommand(session.game,{type:'pause'});
      session.socket?.terminate();session.socket=undefined;
    }
    return closeHttp(callback);
  };
  server.once('close', () => {clearInterval(timer);for(const ws of live?.clients??[])ws.terminate();live?.close();});
  return server;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const production = process.env.NODE_ENV === 'production';
    const port = readPort(process.env.GHOST_PROTOCOL_PORT ?? process.env.PORT, production);
    const server = createGameServer({ production });
    server.on('error', (error: NodeJS.ErrnoException) => {
      console.error(error.code === 'EADDRINUSE'
        ? `Ghost Protocol could not start: port ${port} is occupied. Choose a free port in 5320–5329; no process was stopped.`
        : `Ghost Protocol could not start on 127.0.0.1:${port}: ${error.message}`);
      process.exitCode = 1;
    });
    server.listen(port, '127.0.0.1', () => console.log(`Ghost Protocol ${production ? 'game' : 'API'} ready at http://127.0.0.1:${port}`));
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  }
}
