import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { LEVEL } from '../shared/level.ts';

// Every action below comes through the real user interface. Public snapshots only
// guide keyboard input; this probe never writes actor coordinates or engine state.
const base = process.env.GHOST_PROTOCOL_BASE || 'http://127.0.0.1:5320';
const output = process.env.GHOST_PROTOCOL_CAPTURE_DIR || 'captures/maze-chase';
const keyOf = p => `${p.x},${p.z}`;
const same = (a, b) => a.x === b.x && a.z === b.z;
const offsets = { north: {x:0,z:-1}, east: {x:1,z:0}, south: {x:0,z:1}, west: {x:-1,z:0} };
const keys = { north:'w', east:'d', south:'s', west:'a' };
const tiles = new Map(LEVEL.tiles.map(tile => [keyOf(tile),tile]));
const objects = Object.fromEntries(LEVEL.objects.map(object => [object.type,object]));
const canStep = (a,b) => {
  const from=tiles.get(keyOf(a)), to=tiles.get(keyOf(b));
  return Boolean(from && to && (from.zone===to.zone || LEVEL.gates.some(gate =>
    (same(gate.a,a)&&same(gate.b,b)) || (same(gate.b,a)&&same(gate.a,b)))));
};
function pathBetween(from,to) {
  const queue=[[from]], seen=new Set([keyOf(from)]);
  for(let i=0;i<queue.length;i++) {
    const path=queue[i], last=path.at(-1);
    if(same(last,to))return path;
    for(const offset of Object.values(offsets)) {
      const next={x:last.x+offset.x,z:last.z+offset.z};
      if(seen.has(keyOf(next))||!canStep(last,next))continue;
      seen.add(keyOf(next));queue.push([...path,next]);
    }
  }
  throw new Error(`No physical route ${keyOf(from)} to ${keyOf(to)}`);
}
const directionBetween=(a,b)=>b.x>a.x?'east':b.x<a.x?'west':b.z>a.z?'south':'north';
const browser = await chromium.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true,args:['--use-gl=angle','--use-angle=metal']});
const errors=[];
await fs.mkdir(`${output}/raw`,{recursive:true});
function controller(page,record=false) {
  const trajectory=[], responses=[], inputs=[];
  page.on('pageerror',error=>errors.push(error.message));
  page.on('console',message=>{if(message.type()==='error')errors.push(message.text());});
  page.on('response',async response=>{
    if(response.url().endsWith('/api/command')) {
      const body=await response.json().catch(()=>null);
      responses.push({time:Date.now(),status:response.status(),body});
    }
  });
  async function read() {
    const s=await page.evaluate(async()=>await(await fetch('/api/state')).json());
    if(record)trajectory.push({time:Date.now(),status:s.status,elapsedMs:s.elapsedMs,player:s.player,sentry:s.sentry,direction:s.direction,queuedDirection:s.queuedDirection,sentryMode:s.sentryMode,carrying:s.carrying,revoked:s.grant?.revoked||false,shards:s.collectedShards?.length,event:s.event,eventId:s.eventId});
    return s;
  }
  async function idle(ms) {
    const end=Date.now()+ms;let s;
    do{s=await read();await page.waitForTimeout(Math.min(80,Math.max(1,end-Date.now())));}while(Date.now()<end);
    return s;
  }
  async function press(key) {
    const wait=page.waitForResponse(response=>response.url().endsWith('/api/command')&&response.request().method()==='POST',{timeout:2500});
    inputs.push({time:Date.now(),key});await page.keyboard.press(key);
    const response=await wait;assert.equal(response.status(),200);return response.json();
  }
  async function click(name) {
    const wait=page.waitForResponse(response=>response.url().endsWith('/api/command')&&response.request().method()==='POST',{timeout:5000});
    await page.getByRole('button',{name,exact:true}).click();
    const response=await wait;assert.equal(response.status(),200);await page.waitForTimeout(60);return response.json();
  }
  async function until(predicate,timeout=10000,label='state condition') {
    const end=Date.now()+timeout;let last;
    while(Date.now()<end){last=await read();if(predicate(last))return last;await page.waitForTimeout(20);}
    throw new Error(`Timed out waiting for ${label}: ${JSON.stringify(last)}`);
  }
  async function go(target,{stop=true}={}) {
    let current=await read();assert.equal(current.status,'playing',`Cannot navigate: ${current.message}`);
    const path=pathBetween(current.player,target);let index=0;
    while(index<path.length-1) {
      const direction=directionBetween(path[index],path[index+1]);let end=index+1;
      while(end<path.length-1&&directionBetween(path[end],path[end+1])===direction)end++;
      const dest=path[end];await press(keys[direction]);
      current=await until(s=>same(s.player,dest)||s.status!=='playing',(end-index)*550+2500,`route segment to ${keyOf(dest)}`);
      assert.equal(current.status,'playing',`Run ended before ${keyOf(target)}: ${current.message}`);
      index=end;
    }
    if(stop){await press('Space');await page.waitForTimeout(65);}
    return read();
  }
  async function restart() {
    const s=await read();
    if(s.status==='lost')return click('Try again');
    if(s.status==='won')return click('Play again');
    await press('r');await page.getByRole('heading',{name:'Restart this heist?',exact:true}).waitFor();return click('Restart heist');
  }
  return {read,idle,press,click,until,go,restart,trajectory,responses,inputs};
}

try {
  // Functional checks have their own session and cannot contaminate the showcase.
  const checkContext=await browser.newContext({viewport:{width:1920,height:1080}});
  const p=await checkContext.newPage();const check=controller(p);
  await p.goto(base);await check.click('Start heist');
  const started=await check.read();assert.equal(typeof started.elapsedMs,'number','This check requires the real-time maze revision');
  const idleStart=await check.read();await check.idle(1150);const idleEnd=await check.read();
  assert.deepEqual(idleEnd.player,idleStart.player,'Idle player unexpectedly moved');
  assert.notDeepEqual(idleEnd.sentry,idleStart.sentry,'Sentry did not move independently while player was idle');
  assert(idleEnd.elapsedMs>idleStart.elapsedMs+700,'Simulation did not advance independently');
  const lines=Object.entries(offsets).map(([direction,delta])=>{
    const line=[{...idleEnd.player}];for(;;){const last=line.at(-1),next={x:last.x+delta.x,z:last.z+delta.z};if(!canStep(last,next)||tiles.get(keyOf(next)).zone!=='service')break;line.push(next);}return {direction,line};
  }).sort((a,b)=>b.line.length-a.line.length);
  const straight=lines[0];assert(straight.line.length>=3,'Start needs a continuous run of at least two tiles for this check');
  await check.press(keys[straight.direction]);
  const continuous=await check.until(s=>same(s.player,straight.line[2]),1600,'two steps after one direction input');
  const wall=await check.until(s=>same(s.player,straight.line.at(-1)),straight.line.length*300+1500,'corridor wall');
  await check.idle(650);assert.deepEqual((await check.read()).player,wall.player,'Player passed through a wall');
  await check.press('Space');await p.waitForTimeout(65);await check.press('Escape');
  const paused=await check.read();assert.equal(paused.status,'paused');await p.keyboard.press('d');await check.idle(900);const pausedAfter=await check.read();
  assert.deepEqual(pausedAfter.player,paused.player);assert.deepEqual(pausedAfter.sentry,paused.sentry);assert.equal(pausedAfter.elapsedMs,paused.elapsedMs,'Pause did not freeze the authoritative clock');
  await p.setViewportSize({width:1280,height:800});await p.waitForTimeout(200);
  const music=p.getByRole('button',{name:'Music',exact:true}),effects=p.getByRole('button',{name:'Sound effects',exact:true});
  assert.equal(await music.getAttribute('aria-pressed'),'true');await music.click();assert.equal(await music.getAttribute('aria-pressed'),'false');await music.click();
  await effects.click();assert.equal(await effects.getAttribute('aria-pressed'),'false');await effects.click();
  const volume=p.getByRole('slider',{name:'Music volume',exact:true});await volume.press('Home');for(let i=0;i<6;i++)await volume.press('ArrowRight');assert.equal(await volume.inputValue(),'30');
  await p.screenshot({path:`${output}/sound-controls.png`});
  const overflow=await p.evaluate(()=>({x:document.documentElement.scrollWidth>innerWidth,y:document.documentElement.scrollHeight>innerHeight}));assert.deepEqual(overflow,{x:false,y:false});
  await check.press('Escape');assert.equal((await check.read()).status,'playing','Escape from sound slider did not resume');
  await p.waitForTimeout(180);await p.screenshot({path:`${output}/verification-laptop.png`});
  await check.restart();await check.go(objects.terminal);assert((await check.read()).grant,'Walking over the key did not grant access');
  await check.go(objects.package);const packageState=await check.read();assert(packageState.carrying,'Walking over package did not collect it');
  const lost=await check.until(s=>s.status==='lost',25000,'pursuer catching an idle player');
  await p.getByRole('heading',{name:'Caught in the act.',exact:true}).waitFor();await p.screenshot({path:`${output}/verification-loss.png`});
  await check.restart();const restarted=await check.read();assert.equal(restarted.status,'playing');assert.deepEqual(restarted.player,LEVEL.start);assert.equal(restarted.grant,null);assert.equal(restarted.carrying,false);assert(restarted.elapsedMs<700);
  const functional={independentSentry:{start:idleStart,end:idleEnd},continuousMovement:{singleInput:keys[straight.direction],start:idleEnd.player,afterTwoSteps:continuous.player},wallCollision:{position:wall.player},pause:{before:paused,after:pausedAfter},automaticPickups:{key:true,package:true},loss:{status:lost.status,elapsedMs:lost.elapsedMs,player:lost.player,sentry:lost.sentry},restart:true,audioControls:true,escapeFromSlider:true,laptopOverflow:overflow};
  await checkContext.close();

  const context=await browser.newContext({viewport:{width:1920,height:1080},deviceScaleFactor:1,recordVideo:{dir:`${output}/raw`,size:{width:1920,height:1080}}});
  const epoch=Date.now(),page=await context.newPage(),live=controller(page,true);
  await page.goto(base);await page.getByRole('button',{name:'Start heist',exact:true}).waitFor();await page.waitForTimeout(2200);
  await page.getByRole('button',{name:'Mute audio',exact:true}).click();await page.getByRole('button',{name:'Enable audio',exact:true}).click();
  const audioOffsetSeconds=(Date.now()-epoch)/1000;
  const capturedAudio=await page.evaluate(()=>{
    if(!window.ghostProtocolAudioStream)return false;
    const chunks=[],recorder=new MediaRecorder(window.ghostProtocolAudioStream,{mimeType:'audio/webm;codecs=opus'});
    window.ghostAudioRecorder=recorder;window.ghostAudioChunks=chunks;recorder.ondataavailable=event=>{if(event.data.size)chunks.push(event.data)};recorder.start(250);return true;
  });
  assert(capturedAudio,'The actual soundtrack capture stream was unavailable');
  await live.click('Start heist');await live.idle(850);
  // A service-bay lap reveals the larger maze and visibly active patrol before
  // crossing into the vault. The destinations come from the shipped tile graph.
  const service=LEVEL.tiles.filter(tile=>tile.zone==='service');
  const north=service.filter(tile=>tile.z===Math.min(...service.map(t=>t.z))).sort((a,b)=>a.x-b.x)[0];
  const farNorth=service.filter(tile=>tile.z===north.z).sort((a,b)=>b.x-a.x)[0];
  const south=service.filter(tile=>tile.x===farNorth.x).sort((a,b)=>b.z-a.z)[0];
  await live.go(north);await live.go(farNorth);await live.go(south);
  const nearSouth=service.filter(tile=>tile.z===south.z).sort((a,b)=>a.x-b.x)[0];
  await live.go(nearSouth);await live.go(north);await live.go(farNorth);await live.go(south);
  await live.go(objects.terminal);await live.idle(650);
  assert((await live.read()).grant);await page.screenshot({path:`${output}/01-borrowed-access.png`});
  await live.go(objects.package);assert((await live.read()).carrying);await page.screenshot({path:`${output}/02-package-and-pursuit.png`});
  await live.go(objects.console);await live.press('e');const revoked=await live.read();assert(revoked.grant?.revoked,'Console did not revoke the shared key');
  const denied=await live.until(s=>s.decisions.some(d=>d.actor==='sentry'&&!d.allow&&d.reason==='role revoked'),18000,'real sentry gate denial');
  await live.idle(650);await page.screenshot({path:`${output}/03-access-denied.png`});
  const escape=LEVEL.tiles.filter(tile=>tile.zone==='escape'), topZ=Math.min(...escape.map(t=>t.z));
  const leftX=objects.console.x, rightX=Math.max(...escape.map(t=>t.x));
  // Collect another circuit of chips while the revoked gate holds the pursuer.
  // Keep the recording active rather than stretching a static victory screen.
  do {
    await live.go({x:leftX,z:topZ});await live.go({x:rightX,z:topZ});
    await live.go({x:rightX,z:objects.console.z});await live.go(objects.console);
  } while(Date.now()-epoch<29000);
  await live.go(objects.extraction);const won=await live.until(s=>s.status==='won',5000,'automatic extraction hold');assert.equal(won.status,'won');
  await page.getByRole('heading',{name:'A clean getaway.',exact:true}).waitFor();
  await page.waitForTimeout(1200);await page.getByRole('button',{name:'Inspect the access decisions',exact:true}).click();await page.waitForTimeout(1800);
  const stats=await page.evaluate(()=>window.ghostProtocolRenderStats);
  const audioData=await page.evaluate(async()=>{const recorder=window.ghostAudioRecorder;await new Promise(resolve=>{recorder.onstop=resolve;recorder.stop()});const blob=new Blob(window.ghostAudioChunks,{type:'audio/webm'});return Array.from(new Uint8Array(await blob.arrayBuffer()))});
  await fs.writeFile(`${output}/raw/gameplay-audio.webm`,Buffer.from(audioData));
  const video=page.video();await page.close();await context.close();await video.saveAs(`${output}/ghost-protocol-gameplay.webm`);
  const recording={browser:await browser.version(),base,viewport:{width:1920,height:1080},stats,capturedAudio,audioOffsetSeconds,wallDurationSeconds:(Date.now()-epoch)/1000,inputMethod:'Real keyboard and buttons, guided by read-only public snapshots. No direct state mutation.',success:won,denial:denied.decisions.filter(d=>d.actor==='sentry'&&!d.allow),errors,inputs:live.inputs,trajectory:live.trajectory,states:live.responses};
  const report={browser:await browser.version(),base,stats,errors,checks:functional,success:{status:won.status,elapsedMs:won.elapsedMs,shards:won.collectedShards?.length,revoked:won.grant?.revoked,denials:recording.denial},capturedAudio,audioOffsetSeconds,recordingSeconds:recording.wallDurationSeconds};
  await fs.writeFile(`${output}/recording-receipt.json`,JSON.stringify(recording,null,2)+'\n');await fs.writeFile(`${output}/browser-verification.json`,JSON.stringify(report,null,2)+'\n');
  assert.deepEqual(errors,[]);console.log(JSON.stringify(report,null,2));
} catch(error) {
  const pages=[];for(const context of browser.contexts())for(const page of context.pages()){pages.push(await page.evaluate(async()=>({url:location.href,state:await(await fetch('/api/state')).json()})).catch(()=>null));await page.screenshot({path:`${output}/verification-failure.png`}).catch(()=>{});}
  await fs.writeFile(`${output}/verification-failure.json`,JSON.stringify({time:new Date().toISOString(),message:error.message,stack:error.stack,errors,pages},null,2)+'\n');
  throw error;
} finally { await browser.close(); }
