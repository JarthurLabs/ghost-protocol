import { createGameServer } from './index.js';

// This entrypoint is for an explicitly provisioned persistent host. The normal
// local entrypoint remains restricted to this game's reserved loopback ports.
const origin=process.env.GHOST_PROTOCOL_PUBLIC_ORIGIN??process.env.RENDER_EXTERNAL_URL;
if(!origin)throw Error('Set GHOST_PROTOCOL_PUBLIC_ORIGIN to the exact public HTTPS origin.');
const port=Number(process.env.PORT??10000);
if(!Number.isInteger(port)||port<1024||port>65535)throw Error('PORT must be an integer from 1024 to 65535.');
const server=createGameServer({production:true,realtime:true,publicOrigin:origin});
server.listen(port,'0.0.0.0',()=>console.log('Ghost Protocol realtime server ready.'));
for(const signal of ['SIGTERM','SIGINT'] as const)process.once(signal,()=>{server.close(()=>process.exit(0));setTimeout(()=>process.exit(1),25000).unref();});
