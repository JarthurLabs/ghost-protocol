import type { Command, GameState } from '../shared/types.js';

/** A single ordered stream; an uncertain command is rejected, never replayed. */
export class LiveGameConnection {
  private socket: WebSocket;
  private sequence=0;
  private nextId=1;
  private stopped=false;
  private heartbeat:ReturnType<typeof setInterval>;
  private opened:Promise<void>;
  private readyResolve!:()=>void;
  private readyReject!:(reason:Error)=>void;
  private deadline:ReturnType<typeof setTimeout>;
  private lastMessage=Date.now();
  private pending=new Map<number,{resolve:(state:GameState)=>void;reject:(error:Error)=>void;timer:ReturnType<typeof setTimeout>}>();

  constructor(url:string,onState:(state:GameState)=>void,private onError:(message:string)=>void,createSocket:(url:string)=>WebSocket=url=>new WebSocket(url)){
    this.opened=new Promise((resolve,reject)=>{this.readyResolve=resolve;this.readyReject=reject;});
    this.socket=createSocket(url);
    this.deadline=setTimeout(()=>this.fail('The live connection timed out. Reconnect to continue.'),4000);
    this.socket.addEventListener('message',event=>{
      if(this.stopped)return;
      try{
        const frame=JSON.parse(String(event.data));
        if(!Number.isSafeInteger(frame.seq)||frame.seq!==this.sequence+1)throw Error('The live updates arrived out of order.');
        this.sequence=frame.seq;this.lastMessage=Date.now();
        if(frame.kind==='heartbeat')return;
        if(frame.kind==='error'){
          const pending=this.pending.get(frame.id);
          if(pending){clearTimeout(pending.timer);this.pending.delete(frame.id);pending.reject(Error(frame.error));}
          if(frame.code==='sequence')this.fail('An input arrived out of order. Reconnect to continue.');
          return;
        }
        if(!frame.state?.status||!['ack','state'].includes(frame.kind))throw Error('The live connection sent an invalid update.');
        onState(frame.state);clearTimeout(this.deadline);this.readyResolve();
        if(frame.kind==='ack'){
          const pending=this.pending.get(frame.id);
          if(pending){clearTimeout(pending.timer);this.pending.delete(frame.id);pending.resolve(frame.state);}
        }
      }catch(error){this.fail(error instanceof Error?error.message:'The live connection was interrupted.');}
    });
    this.socket.addEventListener('close',()=>this.fail('Contact with the game server was lost. Reconnect, then resume your run.'));
    this.socket.addEventListener('error',()=>this.fail('The live connection could not open. Close other game tabs and reconnect.'));
    this.heartbeat=setInterval(()=>{
      if(this.socket.readyState===1){
        if(Date.now()-this.lastMessage>4000){this.fail('Contact with the game server timed out. Reconnect to continue.');return;}
        this.socket.send('{"kind":"heartbeat"}');
      }
    },750);
  }
  ready(){return this.opened;}
  command(command:Command):Promise<GameState>{
    if(this.stopped||this.socket.readyState!==1)return Promise.reject(Error('Reconnect to the game server before continuing.'));
    const id=this.nextId++;
    return new Promise((resolve,reject)=>{
      const timer=setTimeout(()=>this.fail('An action was not confirmed. Reconnect to check the run before trying again.'),4000);
      this.pending.set(id,{resolve,reject,timer});
      try{this.socket.send(JSON.stringify({kind:'command',id,command}));}catch{this.fail('The action could not be sent. Reconnect to continue.');}
    });
  }
  private fail(message:string){if(this.stopped)return;this.close(message);this.onError(message);}
  close(message='Connection closed.'){
    if(this.stopped)return;this.stopped=true;clearTimeout(this.deadline);clearInterval(this.heartbeat);
    const error=Error(message);this.readyReject(error);
    for(const pending of this.pending.values()){clearTimeout(pending.timer);pending.reject(error);}this.pending.clear();
    this.socket.close();
  }
}
