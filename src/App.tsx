import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import type { Command, Decision, Direction, GameState } from '../shared/types';
import Scene from './Scene';
import { LEVELS, getLevel } from '../shared/level';
import Briefing from './Briefing';
import DefenderLab from './DefenderLab';
import FieldGuide from './FieldGuide';
import { getLearningFeedback } from './learningFeedback';
import { MissionSelect, Debrief, Credits } from './CampaignScreens';
import { loadProgress, saveProgress, recordCompletion } from './progress';
import './learning.css';
import { audio, type Cue } from './audio';
import { LiveGameConnection } from './liveConnection';

function savedBoolean(key: string, fallback: boolean) {
  try { const value = localStorage.getItem(key); return value === null ? fallback : value === 'true'; }
  catch { return fallback; }
}
function saveBoolean(key: string, value: boolean) {
  try { localStorage.setItem(key, String(value)); } catch { /* Private browsing may deny storage. */ }
}
function savedMusicVolume() {
  try { const stored=localStorage.getItem('ghost-protocol-music-volume');const value=stored===null?.55:Number(stored);return Number.isFinite(value)?Math.max(0,Math.min(1,value)):.55; }
  catch { return .55; }
}
function Icon({ kind }: { kind: 'audio' | 'muted' | 'pause' | 'play' | 'inspect' | 'close' | 'arrow' | 'key' | 'check' | 'restart' }) {
  const paths: Record<string, ReactNode> = {
    audio: <><path d="m10 5-5 4H2v6h3l5 4V5Z" /><path d="M14 8c3 2 3 6 0 8m3-11c5 4 5 10 0 14" /></>,
    muted: <><path d="m10 5-5 4H2v6h3l5 4V5Z" /><path d="m15 9 6 6m0-6-6 6" /></>,
    pause: <><path d="M8 5v14M16 5v14" strokeWidth="3" /></>,
    play: <path d="m8 5 11 7-11 7V5Z" />,
    inspect: <><path d="m8 6-6 6 6 6m8-12 6 6-6 6m-5-2 2-8" /></>,
    close: <path d="m6 6 12 12m0-12L6 18" />,
    arrow: <path d="M4 12h15m-5-5 5 5-5 5" />,
    key: <><circle cx="8" cy="9" r="4" /><path d="m11 12 8 8m-3-3 3-3m-6 0 3-3" /></>,
    restart: <><path d="M20 7v5h-5"/><path d="M19 12a7 7 0 1 0-2 5M20 12l-3-5"/></>,
    check: <path d="m5 12 4 4L19 6" />,
  };
  return <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{paths[kind]}</svg>;
}

const atExtraction = (state: GameState) => {
  const extraction=getLevel(state.levelId).objects.find(object=>object.type==='extraction')!;
  return state.player.x===extraction.x&&state.player.z===extraction.z;
};
function clockText(milliseconds:number) { const seconds=Math.floor(milliseconds/1000);return `${Math.floor(seconds/60)}:${String(seconds%60).padStart(2,'0')}`; }
function objectiveFor(state:GameState) {
  const level=getLevel(state.levelId),compromised=state.grants.find(grant=>grant.id===level.compromisedGrantId);
  const transit=level.extractionGrantId?state.grants.find(grant=>grant.id===level.extractionGrantId):null;
  if(!compromised)return{step:'01',title:'Pick up your way in.',text:'Run over the amber Vault key. It opens matching Vault gates automatically.',tag:'V · VAULT KEY'};
  if(!compromised.revoked&&compromised.expiresAt<=state.elapsedMs&&!(state.carrying&&level.tiles.find(tile=>tile.x===state.player.x&&tile.z===state.player.z)?.zone==='escape'))return{step:'02',title:'Your access has expired.',text:'Find a reader with the clock symbol marked Vault. Walk onto it or press E nearby to refill the timer.',tag:'↻ · VAULT TIMER READER'};
  if(!state.carrying&&compromised.revoked)return{step:'02',title:'Restore archive access.',text:'Vault is locked before the data is collected. Return to the amber key or a Vault clock reader to reopen its gates.',tag:'V · RESTORE VAULT'};
  if(!state.carrying&&level.extractionGrantId&&(!transit||transit.revoked||transit.expiresAt<=state.elapsedMs))return{step:'02',title:'Pick up your exit key.',text:'Run over the cyan Transit key before entering the archive. It opens the final exit and stays separate from Vault.',tag:'T · TRANSIT KEY'};
  if(!state.carrying)return{step:'02',title:'Read the maze. Find the data.',text:level.id===3||level.id===5?'Reach the gold package in the indigo archive. Watch the Vault timer; its clock reader can renew it.':'Reach the gold package in the indigo archive. Watch the patrols. Chips are optional, so choose your detours carefully.',tag:'GOLDEN DATA PACKAGE'};
  if(!compromised.revoked&&getLevel(state.levelId).tiles.find(t=>t.x===state.player.x&&t.z===state.player.z)?.zone!=='escape')return{step:'03',title:'Outrun the copied key.',text:'The pursuers copied Vault access. Cross into cyan and press E at the glowing switch on the Vault doorway.',tag:'× · VAULT LOCKDOWN'};
  if(!compromised.revoked)return{step:'04',title:state.contextObjectId==='revocation-console'?'Lock Vault behind you.':'Return to the door switch.',text:'Press E at the glowing switch beside the Vault gate you just crossed. It disables copied Vault access'+(level.grants.length>1?'; Transit stays unchanged.':'. Then follow cyan to extraction.'),tag:'× · VAULT DOOR SWITCH'};
  if(level.extractionGrantId&&(!transit||transit.revoked||transit.expiresAt<=state.elapsedMs))return{step:'05',title:'Restore your Transit access.',text:'Collect the cyan Transit key, or use its clock reader. The final gate uses it automatically.',tag:'T · TRANSIT KEY'};
  if(atExtraction(state))return{step:'05',title:'Your ride is here.',text:'Stay on the pad for two seconds to secure the data.',tag:'EXTRACTION UPLINK'};
  return{step:'05',title:'Leave the breach behind.',text:level.extractionGrantId?'Vault is locked down. Follow the Transit gate to the extraction pad; your key works automatically.':'Vault is locked down. Follow the cyan path to the extraction pad.',tag:'EXTRACTION PAD'};
}
function newDeniedDecision(previous: GameState | null, next: GameState): Decision | undefined {
  if (next.eventId === previous?.eventId) return;
  const last = previous?.decisions.at(-1);
  const start = last ? next.decisions.map(decision => JSON.stringify(decision)).lastIndexOf(JSON.stringify(last)) + 1 : 0;
  return next.decisions.slice(start).find(decision => !decision.allow && next.sentries.some(sentry=>sentry.id===decision.actor) && /revok/i.test(decision.reason));
}

function DeviceGuide({dual}:{dual:boolean}) {
  return <details className="device-guide"><summary>What are these devices?</summary><div className="device-guide-rows">
    <p><b className="device-symbol vault-symbol">V</b><span><strong>Vault key</strong>Opens the amber-marked archive gates.</span></p>
    {dual&&<p><b className="device-symbol transit-symbol">T</b><span><strong>Transit key</strong>Opens the cyan-marked exit gate.</span></p>}
    <p><b className="device-symbol">↻</b><span><strong>Clock reader</strong>Refills the timer on its named key.</span></p>
    <p><b className="device-symbol lockdown-symbol">×</b><span><strong>Vault door switch</strong>On the cyan side of the doorway. Press E to disable Vault access for you and its copied holders.{dual?' Transit is separate.':''}</span></p>
    <small>Keys work automatically at gates. Plain machinery on the solid islands is scenery.</small><small className="reading-tip">Need a moment? Escape pauses the game. The field guide is there too.</small>
  </div></details>;
}

export default function App() {
  const [state, setState] = useState<GameState | null>(null);
  const [screen,setScreen]=useState<'game'|'missions'|'briefing'|'defender'|'credits'>('game');
  const [progress,setProgress]=useState(loadProgress);
  const [storageWarning,setStorageWarning]=useState(false);
  const [introRequested,setIntroRequested]=useState(false);
  const [overview,setOverview]=useState(true);
  const menuPaused=useRef(false);
  const stateRef = useRef<GameState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);
  const [audioEnabled, setAudioEnabled] = useState(() => savedBoolean('ghost-protocol-audio', true));
  const [musicEnabled, setMusicEnabled] = useState(() => savedBoolean('ghost-protocol-music', true));
  const [effectsEnabled, setEffectsEnabled] = useState(() => savedBoolean('ghost-protocol-effects', true));
  const [musicVolume, setMusicVolume] = useState(savedMusicVolume);
  const [reducedMotion, setReducedMotion] = useState(() => savedBoolean('ghost-protocol-reduced-motion', matchMedia('(prefers-reduced-motion: reduce)').matches));
  const [inspector, setInspector] = useState(false);
  const [restartConfirm, setRestartConfirm] = useState(false);
  const [deniedTurn, setDeniedTurn] = useState<number | null>(null);
  const [interactionFeedback, setInteractionFeedback] = useState<{event:string;message:string}|null>(null);
  const [fps, setFps] = useState<number | null>(null);
  const [retry, setRetry] = useState(0);
  const inspectorPaused = useRef(false);
  const restartPaused = useRef(false);
  const overlayRef = useRef<HTMLDivElement>(null);
  const connectionErrorRef = useRef<HTMLDivElement>(null);
  const deniedTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const interactionTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const requestTail = useRef<Promise<void>>(Promise.resolve());
  const liveConnection = useRef<LiveGameConnection|null>(null);
  const connectionEpoch = useRef(0);
  const transportReady = useRef(false);
  const lastDenialAt = useRef(0);
  const activeRequest = useRef<AbortController | null>(null);

  const requestState = useCallback(async (path: string, options: RequestInit = {}, signal?: AbortSignal): Promise<GameState> => {
    const controller = new AbortController();
    const abort = () => controller.abort();
    const timeout = setTimeout(() => controller.abort(new Error('Connection timed out. The run will pause while contact is restored.')), 4000);
    signal?.addEventListener('abort', abort, { once: true });
    if (signal?.aborted) controller.abort();
    activeRequest.current = controller;
    try {
      const response = await fetch(path, { credentials: 'same-origin', ...options, signal: controller.signal });
      const data = await response.json();
      if (!response.ok || !data.status) throw new Error(data.error || 'The facility is not responding.');
      return data as GameState;
    } finally {
      clearTimeout(timeout);
      signal?.removeEventListener('abort', abort);
      if (activeRequest.current === controller) activeRequest.current = null;
    }
  }, []);

  const acceptState = useCallback((next: GameState, audible = true) => {
    const previous = stateRef.current;
    stateRef.current = next;
    setState(next);
    if(next.interactionLabel&&next.contextObjectId!==previous?.contextObjectId){
      setInteractionFeedback(current=>current&&['denied','interaction-missed'].includes(current.event)?null:current);
    }
    if (!previous && next.defender) setScreen('defender');
    const denied = newDeniedDecision(previous, next);
    let cue: Cue | null = null;
    if (next.status === 'title' || next.elapsedMs === 0) {
      setDeniedTurn(null);
      setInteractionFeedback(null);
      if (deniedTimer.current) clearTimeout(deniedTimer.current);
      if (interactionTimer.current) clearTimeout(interactionTimer.current);
    }
    if (next.status === 'won' && previous?.status !== 'won') cue = 'win';
    else if (next.status === 'lost' && previous?.status !== 'lost') cue = 'lose';
    else if (next.grants.some(grant=>grant.revoked&&!previous?.grants.find(old=>old.id===grant.id)?.revoked)) cue = 'revoke';
    else if (next.carrying && !previous?.carrying) cue = 'pickup';
    else if (next.grants.length > (previous?.grants.length ?? 0)) cue = 'grant';
    else if (previous?.status === 'title' && next.status === 'playing') cue = 'start';
    else if (denied && performance.now() - lastDenialAt.current > 2200) cue = 'deny';
    else if (previous && (previous.player.x !== next.player.x || previous.player.z !== next.player.z)) cue = 'move';
    if (denied && next.status !== 'title' && performance.now() - lastDenialAt.current > 2200) {
      lastDenialAt.current = performance.now();
      setDeniedTurn(next.turn);
      if (deniedTimer.current) clearTimeout(deniedTimer.current);
      deniedTimer.current = setTimeout(() => setDeniedTurn(null), 3800);
    }
    if (audible && cue) audio.cue(cue);
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    const epoch=++connectionEpoch.current;
    transportReady.current=false;busyRef.current=true;setBusy(true);
    let timer: ReturnType<typeof setTimeout>;
    const poll = () => {
      if (controller.signal.aborted) return;
      const read = async () => {
        if (controller.signal.aborted || document.hidden) return;
        try {
          const data = await requestState('/api/state', {}, controller.signal);
          if (!controller.signal.aborted) { acceptState(data, Boolean(stateRef.current)); setError(null); }
        } catch (cause) {
          if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : 'Connection interrupted.');
        }
      };
      // Polls and commands share one queue, so an older response cannot rewind a new move.
      requestTail.current = requestTail.current.then(read, read);
      void requestTail.current.then(() => { timer = setTimeout(poll, 80); });
    };
    const connect=async()=>{
      try{
        const transportController=new AbortController();
        const abortTransport=()=>transportController.abort();controller.signal.addEventListener('abort',abortTransport,{once:true});
        const timeout=setTimeout(()=>transportController.abort(Error('The game connection timed out. Reconnect to try again.')),4000);
        let transport:{type:string};
        try{
          const response=await fetch('/api/transport',{credentials:'same-origin',signal:transportController.signal});
          if(!response.ok&&response.status!==404)throw Error('The game connection is unavailable. Reconnect to try again.');
          transport=response.ok?await response.json():{type:'http'};
        }
        finally{clearTimeout(timeout);controller.signal.removeEventListener('abort',abortTransport);}
        if(controller.signal.aborted)return;
        if(transport.type!=='websocket'){transportReady.current=true;busyRef.current=false;setBusy(false);poll();return;}
        const initial=await requestState('/api/state',{},controller.signal);
        if(controller.signal.aborted)return;
        acceptState(initial,false);
        const url=new URL('/api/live',location.href);url.protocol=location.protocol==='https:'?'wss:':'ws:';
        const connection=new LiveGameConnection(url.href,next=>{if(!controller.signal.aborted){acceptState(next);setError(null);}},message=>{if(!controller.signal.aborted){transportReady.current=false;setError(message);}});
        liveConnection.current=connection;
        await connection.ready();
        if(!controller.signal.aborted){transportReady.current=true;busyRef.current=false;setBusy(false);}
      }catch(cause){if(!controller.signal.aborted){busyRef.current=false;setBusy(false);setError(cause instanceof Error?cause.message:'Connection interrupted.');}}
    };
    void connect();
    return () => { controller.abort(); clearTimeout(timer); if(connectionEpoch.current===epoch){liveConnection.current?.close();liveConnection.current=null;} };
  }, [acceptState, requestState, retry]);

  useEffect(()=>{if(state?.status==='won')setProgress(previous=>recordCompletion(previous,{runId:state.runId,levelId:state.levelId,elapsedMs:state.elapsedMs,chips:state.collectedShards.length}));},[state?.status,state?.runId]);
  useEffect(()=>{setStorageWarning(!saveProgress(progress));},[progress]);

  useEffect(() => { audio.setEnabled(audioEnabled); saveBoolean('ghost-protocol-audio', audioEnabled); }, [audioEnabled]);
  useEffect(() => { audio.setMusicEnabled(musicEnabled); saveBoolean('ghost-protocol-music', musicEnabled); }, [musicEnabled]);
  useEffect(() => { audio.setEffectsEnabled(effectsEnabled); saveBoolean('ghost-protocol-effects', effectsEnabled); }, [effectsEnabled]);
  useEffect(() => { audio.setMusicVolume(musicVolume); try {localStorage.setItem('ghost-protocol-music-volume',String(musicVolume));} catch {} }, [musicVolume]);
  useEffect(() => { audio.setTension(Boolean(state?.sentries.some(sentry=>sentry.mode==='chase'))); }, [state?.sentries]);
  useEffect(() => { audio.setPlaying(state?.status === 'playing'); }, [state?.status]);
  useEffect(() => { saveBoolean('ghost-protocol-reduced-motion', reducedMotion); }, [reducedMotion]);
  useEffect(() => () => {
    if (deniedTimer.current) clearTimeout(deniedTimer.current);
    if (interactionTimer.current) clearTimeout(interactionTimer.current);
    activeRequest.current?.abort();
    audio.setPlaying(false);
  }, []);

  const command = useCallback((value: Command): Promise<boolean> => {
    const epoch=connectionEpoch.current;
    const modalCommand = !['move','wait','interact'].includes(value.type);
    if(liveConnection.current&&modalCommand&&busyRef.current)return Promise.resolve(false);
    const send = async () => {
      if(epoch!==connectionEpoch.current||!transportReady.current)return false;
      if (modalCommand) { busyRef.current = true; setBusy(true); }
      try {
        const live=liveConnection.current;
        const data = live?await live.command(value):await requestState('/api/command', {
          method: 'POST', keepalive: value.type === 'pause',
          headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(value),
        });
        if(epoch!==connectionEpoch.current)return false;
        if(!live)acceptState(data);
        if(value.type==='interact'&&data.status==='playing'){
          if(interactionTimer.current)clearTimeout(interactionTimer.current);
          setInteractionFeedback({event:data.event,message:data.message});
          interactionTimer.current=setTimeout(()=>setInteractionFeedback(null),3500);
        }
        setError(null);
        return true;
      } catch (cause) {
        if(epoch===connectionEpoch.current)setError(cause instanceof Error ? cause.message : 'Connection interrupted.');
        return false;
      } finally {
        if (modalCommand&&epoch===connectionEpoch.current) { busyRef.current = false; setBusy(false); }
      }
    };
    if(liveConnection.current)return send();
    const result = requestTail.current.then(send, send);
    requestTail.current = result.then(() => undefined);
    return result;
  }, [acceptState, requestState]);

  useEffect(() => {
    const visibility = () => {
      if (document.hidden && stateRef.current?.status === 'playing') void command({ type: 'pause' });
    };
    document.addEventListener('visibilitychange', visibility);
    return () => document.removeEventListener('visibilitychange', visibility);
  }, [command]);

  const toggleAudio = useCallback(() => {
    const next = !audioEnabled;
    audio.setEnabled(next);
    setAudioEnabled(next);
    if (next) void audio.unlock().then(() => audio.cue('tap'));
  }, [audioEnabled]);

  const toggleInspector = useCallback(async () => {
    if (busyRef.current || restartConfirm) return;
    if (inspector) {
      if (inspectorPaused.current && stateRef.current?.status === 'paused') {
        if (!await command({ type: 'resume' })) return;
      }
      inspectorPaused.current = false;
      setInspector(false);
    } else {
      inspectorPaused.current = stateRef.current?.status === 'playing';
      if (inspectorPaused.current && !await command({ type: 'pause' })) { inspectorPaused.current = false; return; }
      setInspector(true);
    }
  }, [command, inspector, restartConfirm]);

  const askRestart = useCallback(async () => {
    if (busyRef.current || inspector || restartConfirm || !stateRef.current || stateRef.current.status === 'title') return;
    restartPaused.current = stateRef.current.status === 'playing';
    if (restartPaused.current && !await command({ type: 'pause' })) { restartPaused.current = false; return; }
    setRestartConfirm(true);
  }, [command, inspector, restartConfirm]);

  const cancelRestart = useCallback(async () => {
    if (busyRef.current) return;
    if (restartPaused.current && stateRef.current?.status === 'paused' && !await command({ type: 'resume' })) return;
    restartPaused.current = false;
    setRestartConfirm(false);
  }, [command]);

  const restart = useCallback(async () => {
    if (await command({ type: 'restart' })) {
      setRestartConfirm(false);
      setInspector(false);
      restartPaused.current = false;
      inspectorPaused.current = false;
    }
  }, [command]);

  const openMission=useCallback(async(id:number,showIntro=false)=>{
    if(await command({type:'select-level',levelId:id})){
      setInspector(false);setRestartConfirm(false);
      setIntroRequested(showIntro||(id===1&&!progress.introSeen));setScreen('briefing');setOverview(id<=2);
    }
  },[command,progress.introSeen]);
  const beginMission=useCallback(async()=>{
    void audio.unlock();
    if(await command({type:'start'})){setProgress(p=>({...p,introSeen:true}));setScreen('game');}
  },[command]);
  const openMissions=useCallback(async()=>{
    menuPaused.current=stateRef.current?.status==='playing';
    if(menuPaused.current&&!await command({type:'pause'}))return;
    setInspector(false);setRestartConfirm(false);setScreen('missions');
  },[command]);
  const leaveScreen=useCallback(async()=>{
    if(screen==='missions'&&menuPaused.current&&stateRef.current?.status==='paused')await command({type:'resume'});
    menuPaused.current=false;setScreen('game');
  },[command,screen]);
  const openDefender=useCallback(async()=>{
    if(await command({type:'defender-start'})){setInspector(false);setScreen('defender');}
  },[command]);
  const interact=useCallback(async()=>{
    if(stateRef.current?.status==='playing')await command({type:'interact'});
  },[command]);

  useEffect(() => {
    const keydown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (event.repeat || event.altKey || event.ctrlKey || event.metaKey || target?.isContentEditable || (target?.closest('input, textarea, select')&&event.key!=='Escape')) return;
      const key = event.key.toLowerCase();
      if (key === 'escape') {
        event.preventDefault();
        if (screen!=='game'){void leaveScreen();return;}
        if (restartConfirm) void cancelRestart();
        else if (inspector) void toggleInspector();
        else if (stateRef.current?.status === 'playing') void command({ type: 'pause' });
        else if (stateRef.current?.status === 'paused') void command({ type: 'resume' });
        return;
      }
      if(screen!=='game')return;
      if(target?.closest('summary')&&(key===' '||key==='enter'))return;
      if(key==='m'&&!inspector&&!restartConfirm){event.preventDefault();setOverview(value=>!value);return;}
      if (key === 'r' && !inspector && !restartConfirm) { event.preventDefault(); void askRestart(); return; }
      if (stateRef.current?.status !== 'playing' || inspector || restartConfirm) return;
      if (target?.closest('button') && (key === 'enter' || (key === ' ' && target.closest('.topbar')))) return;
      const moves: Record<string, Direction> = { w: 'north', arrowup: 'north', s: 'south', arrowdown: 'south', a: 'west', arrowleft: 'west', d: 'east', arrowright: 'east' };
      if(moves[key]&&target?.closest('button, summary'))target.blur();
      if(key==='e'){event.preventDefault();void audio.unlock();void interact();return;}
      const next: Command | null = moves[key] ? { type: 'move', direction: moves[key] } : key === ' ' ? { type: 'wait' } : null;
      if (next) { event.preventDefault(); void audio.unlock(); void command(next); }
    };
    window.addEventListener('keydown', keydown);
    return () => window.removeEventListener('keydown', keydown);
  }, [askRestart,cancelRestart,command,inspector,restartConfirm,toggleInspector,screen,leaveScreen,interact]);

  const hasModal = screen!=='game' || inspector || restartConfirm || state?.status === 'paused' || state?.status === 'won' || state?.status === 'lost';
  useEffect(() => {
    if (!hasModal&&!error) return;
    const scope=()=>error?connectionErrorRef.current:overlayRef.current;
    const previousFocus = document.activeElement as HTMLElement | null;
    const frame = requestAnimationFrame(() => {
      const firstButton = scope()?.querySelector<HTMLButtonElement>('button:not(:disabled)');
      if (firstButton) firstButton.focus();
      else scope()?.focus();
    });
    const trap = (event: KeyboardEvent) => {
      if (event.key !== 'Tab') return;
      const controls = [...(scope()?.querySelectorAll<HTMLElement>('button:not(:disabled), a[href], input:not(:disabled), summary, [tabindex="0"]')??[])].filter(element=>element.getClientRects().length>0);
      if (!controls?.length) return;
      const first = controls[0];
      const last = controls[controls.length - 1];
      if (event.shiftKey && (document.activeElement === first || !scope()?.contains(document.activeElement))) { event.preventDefault(); last?.focus(); }
      else if (!event.shiftKey && (document.activeElement === last || !scope()?.contains(document.activeElement))) { event.preventDefault(); first?.focus(); }
    };
    window.addEventListener('keydown', trap);
    return () => { cancelAnimationFrame(frame); window.removeEventListener('keydown', trap); previousFocus?.focus({ preventScroll: true }); };
  }, [hasModal,inspector,restartConfirm,state?.status,screen,error]);

  const active=state?.status==='playing'&&screen==='game'&&!inspector&&!restartConfirm;
  const level=state?getLevel(state.levelId):LEVELS[0];
  const objective=state?objectiveFor(state):null;
  const learningFeedback=state?getLearningFeedback(state):null;
  const isTitle=state?.status==='title'&&screen==='game';
  const compromised=state?.grants.find(grant=>grant.id===level.compromisedGrantId);
  const chased=state?.sentries.filter(sentry=>sentry.mode==='chase').length??0;
  const blocked=state?.sentries.filter(sentry=>sentry.mode==='blocked').length??0;
  const onAction=(value:Command)=>{void audio.unlock();void command(value);};
  return <main className={`game ${reducedMotion?'reduced-motion':''} ${isTitle?'on-title':''} ${screen!=='game'?'campaign-overlay-open':''} ${overview?'':'following-drone'}`}>
    <div className="scene-shell" aria-label="An isometric training network with maze corridors, access gates and patrolling sentries.">{state&&<Scene state={state} overview={overview} reducedMotion={reducedMotion} onReady={setFps}/>}</div>
    <div className="screen-vignette" aria-hidden="true"/>
    <header className="topbar"><div className="brand" aria-label="Ghost Protocol"><span className="brand-mark" aria-hidden="true"><i/><i/></span><span>GHOST<br/>PROTOCOL</span></div><div className="mission-heading"><span className="mission-index">{String(level.id).padStart(2,'0')}</span><span className="mission-slash">/</span><span>{level.title.toUpperCase()}</span></div><nav className="top-actions" aria-label="Game settings">
      <button className="quiet-button" onClick={()=>void openMissions()} disabled={!state||busy||screen==='briefing'}><span>Missions</span></button>
      <button className="quiet-button restart-level-button" aria-label="Restart level" disabled={!state||isTitle||screen!=='game'||inspector||restartConfirm||busy} onClick={()=>void askRestart()}><Icon kind="restart"/><span>Restart level</span></button>
      <button className="quiet-button" onClick={()=>setOverview(value=>!value)} disabled={screen!=='game'} aria-label={overview?'Follow drone':'Show whole maze'}><span>{overview?'Follow drone':'Whole maze'} <kbd>M</kbd></span></button>
      <button className={`quiet-button ${!audioEnabled?'dimmed':''}`} onClick={toggleAudio} aria-label={audioEnabled?'Mute audio':'Enable audio'} aria-pressed={audioEnabled}><Icon kind={audioEnabled?'audio':'muted'}/><span>Audio</span></button>
      <button className="quiet-button" disabled={!state||isTitle||screen!=='game'||state.status==='won'||state.status==='lost'||inspector||restartConfirm||busy} onClick={()=>onAction({type:state?.status==='paused'?'resume':'pause'})}><Icon kind={state?.status==='paused'?'play':'pause'}/><span>{state?.status==='paused'?'Resume':'Pause'}</span></button>
      <button className="quiet-button" disabled={!state||screen!=='game'||restartConfirm||busy} onClick={()=>void toggleInspector()} aria-expanded={inspector}><Icon kind="inspect"/><span>Inspect</span></button>
    </nav></header>
    {state&&!isTitle&&screen==='game'&&objective&&<aside className="objective-card" aria-label="Current objective"><div className="eyebrow"><span className="mint-line"/>YOUR OBJECTIVE<span className="objective-number">{objective.step}/05</span></div><h1>{objective.title}</h1><p>{objective.text}</p><div className="objective-target"><span className="target-diamond"/>{objective.tag}</div>{state.carrying&&<div className="package-carried"><span className="package-icon"/>DATA PACKAGE SECURED</div>}<div className="field-note" aria-live="polite" aria-atomic="true">{learningFeedback&&<><span className="field-note-label">THE SECURITY CONNECTION</span><strong>{learningFeedback.term}</strong><p>{learningFeedback.text}</p></>}</div><DeviceGuide dual={level.grants.length>1}/></aside>}
    {state&&!isTitle&&screen==='game'&&<aside className="status-stack" aria-label="Heist status"><div className="grant-stack">{level.grants.map(definition=>{const grant=state.grants.find(g=>g.id===definition.id),remaining=grant?Math.max(0,Math.ceil((grant.expiresAt-state.elapsedMs)/1000)):null;return <div key={definition.id} className={`access-status ${grant?.revoked?'revoked':remaining!==null&&remaining<12?'urgent':''}`}><span className="status-icon"><Icon kind={grant?.revoked?'check':'key'}/></span><div><span className="eyebrow">{definition.id==='transit'?'T · TRANSIT KEY':'V · VAULT KEY'}</span><strong>{!grant?'Find key':grant.revoked?'Revoked':remaining===0?'Expired':<>{remaining}<small> seconds left</small></>}</strong><span className="key-purpose">{grant?.revoked?'Gates reject this key':remaining===0?'Timer ended. Renew this key.':definition.id==='transit'?'Opens the final exit gate':'Opens the archive gates'}</span>{state.carrying&&definition.id===level.compromisedGrantId&&!grant?.revoked&&remaining!==0&&<span className="key-copy-note">The pursuers hold a copy.</span>}</div></div>;})}{level.grants.length>1&&<p className="automatic-key-note">Gates use the matching key automatically.</p>}</div><div className={`sentry-status ${chased?'tracking':''}`}><span className="sentry-dot"/><span>{chased?`${chased} IN PURSUIT`:blocked===state.sentries.length?'PURSUERS LOCKED OUT':`${state.sentries.length} ON PATROL`}</span><small>{chased?'They keep moving when you stop.':blocked===state.sentries.length?(compromised?.revoked?'Vault gate requests were denied.':'Expired access. Revoke before extraction.'):'Watch the corners. Avoid dead ends.'}</small></div></aside>}
    {isTitle&&!inspector&&<section className="title-intro" aria-labelledby="title-heading"><div className="eyebrow"><span className="mint-line"/>A CYBERSECURITY MAZE HEIST</div><h1 id="title-heading">A little ghost.<br/><em>A system to outsmart.</em></h1><p>You’re the authorized tester inside a training network.<br/>Borrow access. Expose the breach. Close it behind you.</p><button className="primary-button start-button" disabled={busy} onClick={event=>{event.currentTarget.blur();void audio.unlock();void openMission(progress.unlocked);}}>{Object.keys(progress.results).length?'Continue operation':'Begin operation'}<Icon kind="arrow"/></button><button className="title-secondary" onClick={()=>void openMissions()}>Choose a mission</button><div className="title-meta"><span>FIVE SECTORS + DEFENDER FINALE</span><span>REAL-TIME MAZE CHASE</span></div><button className="text-button intro-replay" onClick={()=>void openMission(1,true)}>Learn the basics</button></section>}
    {state&&!isTitle&&!hasModal&&<div className="live-message" aria-live="polite" aria-atomic="true">
      {state.interactionLabel?<button className={`interaction-prompt actionable ${state.contextObjectId==='revocation-console'?'lockdown-prompt':''}`} onClick={()=>void interact()}><kbd>E</kbd><span>{state.interactionLabel}</span></button>:state.context?<div className="interaction-hint">{state.context.replace(/ · E$/,'')}</div>:!interactionFeedback&&deniedTurn===null&&<div className={`message-text ${chased?'alert-text':''}`}>{state.message}</div>}
      {interactionFeedback?<div className={`interaction-result ${['denied','interaction-missed'].includes(interactionFeedback.event)?'missed':'success'}`} data-interaction-result={interactionFeedback.event}><span aria-hidden="true">{['denied','interaction-missed'].includes(interactionFeedback.event)?'i':'✓'}</span><span>{interactionFeedback.message}</span></div>:deniedTurn!==null&&<div className="denial-toast"><span className="denial-symbol">×</span><div><strong>ACCESS DENIED</strong><span>Revocation removed the pursuers’ gate access.</span></div></div>}
    </div>}
    {state&&state.carrying&&atExtraction(state)&&!hasModal&&<div className="extraction-progress" aria-label={`Extraction: ${Math.round(state.extractionProgress*100)} percent`}><span className="eyebrow">EXTRACTION LINK</span><div>{[1,2,3].map(part=><i key={part} className={state.extractionProgress>=part/3?'complete':''}/>)}</div><small>Stay on the pad</small></div>}
    <footer className="bottom-bar"><div className="controls" aria-label="Heist controls"><div className="movement-control"><div className="direction-pad">{(['north','west','south','east'] as Direction[]).map((direction,index)=><button key={direction} className={`key-button ${direction}`} aria-label={`Move ${direction}`} disabled={!active} onClick={()=>onAction({type:'move',direction})}>{['W','A','S','D'][index]}</button>)}</div><span>Steer<small>WASD or arrows · keeps moving</small></span></div><span className="control-divider"/><button className="control-action interact-control" disabled={!active||!state?.interactionLabel} onClick={()=>{void audio.unlock();void interact();}}><kbd>E</kbd><span>{state?.interactionLabel||'No interaction nearby'}</span></button><button className="control-action" disabled={!active} onClick={()=>onAction({type:'wait'})}><kbd className="wide-key">SPACE</kbd><span>Brake</span></button></div><div className="footer-note"><span className="signal-dot"/>{isTitle?'A FICTIONAL NETWORK. REAL ACCESS DECISIONS.':state?.status==='paused'?'SIMULATION PAUSED':'SPACE STOPS YOU. THE SENTRIES KEEP MOVING.'}</div><div className="run-stats"><span className="chip-counter"><i/>{state?.collectedShards.length??0}<small> CHIPS</small></span><div className="turn-counter"><span className="eyebrow">TIME</span><strong>{clockText(state?.elapsedMs??0)}</strong></div></div></footer>
    {storageWarning&&<div className="save-warning" role="status">Browser storage is unavailable. Progress will last for this visit.</div>}
    {!state&&<div className="loading-screen"><span className="loading-orbit"/><h1>{error?'Connection interrupted.':'Opening the facility.'}</h1><p>{error||'PIP-07 is getting ready.'}</p>{error&&<button className="primary-button" onClick={()=>setRetry(value=>value+1)}>Reconnect</button>}</div>}
    {state&&error&&<div className="error-banner" ref={connectionErrorRef} role="alertdialog" aria-modal="true" aria-label="Connection interrupted"><strong>Connection interrupted.</strong><span>{error}</span><button onClick={()=>{activeRequest.current?.abort();setError(null);setRetry(value=>value+1);}}>Reconnect</button></div>}
    {screen!=='game'&&state&&<div className="campaign-layer" ref={overlayRef} role="dialog" aria-modal={!error} tabIndex={-1} aria-label={screen==='missions'?'Mission selection':screen==='briefing'?'Mission briefing':screen==='defender'?'Defender policy lab':'Campaign complete'}>
      {screen==='missions'?<MissionSelect progress={progress} onSelect={id=>void openMission(id)} onBack={()=>void leaveScreen()} onDefender={()=>void openDefender()}/>:screen==='briefing'?<Briefing key={state.runId} level={level} firstVisit={introRequested||!progress.results[level.id]} intro={introRequested} reducedMotion={reducedMotion} onBegin={()=>void beginMission()} onBack={()=>setScreen('missions')}/>:screen==='defender'?<DefenderLab state={state.defender} busy={busy} reducedMotion={reducedMotion} onPatch={patch=>void command({type:'defender-patch',patch})} onBack={()=>setScreen('missions')} onComplete={()=>{if(state.defender?.success){setProgress(p=>({...p,defenderComplete:true}));setScreen('credits');}}}/>:<Credits progress={progress} onMissions={()=>setScreen('missions')} onDefender={()=>void openDefender()}/>}
    </div>}
    {screen==='game'&&hasModal&&<div className={`modal-backdrop ${inspector?'inspector-backdrop':''}`}><div ref={overlayRef} className={inspector?'inspector-panel':state?.status==='won'?'modal-card debrief-card':'modal-card'} role="dialog" tabIndex={-1} aria-modal={!error} aria-labelledby="overlay-title">
      {inspector?<><div className="inspector-header"><div><span className="eyebrow">BEHIND THE HEIST</span><h2 id="overlay-title">Real access decisions.</h2></div><button className="icon-button" onClick={()=>void toggleInspector()} disabled={busy} aria-label="Close inspector"><Icon kind="close"/></button></div><p className="inspector-description">A key represents a credential. Each gate checks an actor’s permission to access a resource. The local server makes these decisions; the browser cannot choose an identity or invent a win.</p><FieldGuide/><div className="inspection-summary"><span>Sector {state?.levelId}</span><span>{clockText(state?.elapsedMs??0)}</span>{fps!==null&&<span>{Math.round(fps)} FPS measured</span>}</div><div className="decision-list" tabIndex={0} aria-label="Recent authorization decisions">{!state?.decisions.length?<div className="empty-decisions"><Icon kind="key"/><p>No protected requests yet.</p></div>:[...state.decisions].reverse().map((decision,index)=><article className={`decision ${decision.allow?'allowed':'denied'}`} key={`${decision.turn}-${decision.actor}-${index}`}><div className="decision-top"><strong>{decision.allow?'ALLOW':'DENY'}</strong><span>MOVE {decision.turn}</span></div><div className="decision-actor">{decision.actor}<span>→</span>{decision.action}</div><p>{decision.reason}</p><dl><div><dt>Resource</dt><dd>{decision.resource}</dd></div><div><dt>Grant</dt><dd>{decision.grant||'Baseline permission'}</dd></div></dl></article>)}</div><button className="primary-button" onClick={()=>void toggleInspector()} disabled={busy}>Return to heist<Icon kind="arrow"/></button></>:restartConfirm?<><span className="eyebrow">A FRESH APPROACH</span><h2 id="overlay-title">Restart this sector?</h2><p>This run resets. Your completed missions and best results remain saved.</p><div className="modal-actions"><button className="primary-button" disabled={busy} onClick={()=>void cancelRestart()}>Keep this run<Icon kind="arrow"/></button><button className="secondary-button" disabled={busy} onClick={()=>void restart()}>Restart heist</button></div></>:state?.status==='paused'?<><span className="eyebrow">TAKE A BREATHER</span><h2 id="overlay-title">Ghost on standby.</h2><p>The drones, credentials and extraction clock are paused.</p><button className="primary-button" disabled={busy} onClick={()=>onAction({type:'resume'})}>Resume heist<Icon kind="play"/></button><div className="pause-options"><div className="pause-navigation"><button className="secondary-button" disabled={busy} onClick={()=>void askRestart()}>Restart heist</button><button className="secondary-button" disabled={busy} onClick={()=>void openMissions()}>Mission select</button></div><button className="setting-button" aria-pressed={reducedMotion} onClick={()=>setReducedMotion(value=>!value)}><span>Reduced motion</span><span className={`toggle ${reducedMotion?'on':''}`}><i/></span></button></div><FieldGuide/><div className="sound-settings" aria-label="Sound settings"><div className="sound-heading"><span>THE QUIET WAY IN</span><small>Original soundtrack</small></div><button className="setting-button" aria-pressed={musicEnabled} onClick={()=>{void audio.unlock();setMusicEnabled(value=>!value);}}><span>Music</span><span className={`toggle ${musicEnabled?'on':''}`}><i/></span></button><label className="music-volume"><span>Music level<output>{Math.round(musicVolume*100)}%</output></span><input aria-label="Music volume" type="range" min="0" max="100" step="5" value={Math.round(musicVolume*100)} onChange={event=>setMusicVolume(Number(event.target.value)/100)}/></label><button className="setting-button" aria-pressed={effectsEnabled} onClick={()=>setEffectsEnabled(value=>!value)}><span>Sound effects</span><span className={`toggle ${effectsEnabled?'on':''}`}><i/></span></button></div><div className="pause-key-hint"><kbd>ESC</kbd> to resume <span>·</span><kbd>R</kbd> to restart</div></>:state?.status==='won'?<Debrief key={state.runId} state={state} onNext={()=>state.levelId<5?void openMission(state.levelId+1):void openDefender()} onReplay={()=>void restart()} onMissions={()=>void openMissions()} onInspect={()=>void toggleInspector()}/>:<><div className="outcome-mark loss-mark">×</div><span className="eyebrow">SIGNAL LOST</span><h2 id="overlay-title">Caught in the act.</h2><p>{state?.message||'A sentry reached your tile.'}</p><p className="loss-tip">Check the whole maze before committing to a narrow branch. Optional chips are not worth getting cornered.</p><button className="primary-button" disabled={busy} onClick={()=>void restart()}>Try again<Icon kind="arrow"/></button><div className="debrief-links"><button className="text-button" onClick={()=>void openMissions()}>Mission select</button><button className="text-button" onClick={()=>void toggleInspector()}>Inspect what happened</button></div></>}
    </div></div>}
  </main>;
}
