import {chromium} from 'playwright';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {getLevel} from '../shared/level.ts';
import {CAMPAIGN_ROUTES} from '../tests/campaign-routes.ts';
import {createPractice,advancePractice,PRACTICE_STEP_COUNTS} from '../shared/access-practice.ts';
const base=process.env.GHOST_PROTOCOL_BASE||'http://127.0.0.1:5320';
const output=process.env.GHOST_PROTOCOL_CAPTURE_DIR||'captures/finished-game';
const recording=process.env.GHOST_PROTOCOL_RECORD==='1';
const deliberate=process.env.GHOST_PROTOCOL_DELIBERATE==='1';
const interactionChecks=process.env.GHOST_PROTOCOL_INTERACTIONS==='1',interactionResults=[];
const liveConsoleChecks=[],practiceChecks=[];
const same=(a,b)=>a.x===b.x&&a.z===b.z,key=p=>`${p.x},${p.z}`;
const delta={north:{x:0,z:-1},east:{x:1,z:0},south:{x:0,z:1},west:{x:-1,z:0}},keys={north:'w',east:'d',south:'s',west:'a'};
function pathBetween(level,from,to){const tiles=new Map(level.tiles.map(t=>[key(t),t]));const queue=[[from]],seen=new Set([key(from)]);for(let i=0;i<queue.length;i++){const path=queue[i],a=path.at(-1);if(same(a,to))return path;for(const d of Object.values(delta)){const b={x:a.x+d.x,z:a.z+d.z},ta=tiles.get(key(a)),tb=tiles.get(key(b));if(seen.has(key(b))||!tb||!(ta.zone===tb.zone||level.gates.some(g=>(same(g.a,a)&&same(g.b,b))||(same(g.b,a)&&same(g.a,b)))))continue;seen.add(key(b));queue.push([...path,b]);}}throw Error(`No route ${key(from)} -> ${key(to)}`);}
const direction=(a,b)=>b.x>a.x?'east':b.x<a.x?'west':b.z>a.z?'south':'north';
await fs.mkdir(`${output}/raw`,{recursive:true});
const browser=await chromium.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true,args:['--use-gl=angle','--use-angle=metal']});
const context=await browser.newContext({viewport:{width:1920,height:1080},deviceScaleFactor:1,...(recording?{recordVideo:{dir:`${output}/raw`,size:{width:1920,height:1080}}}:{})});
const page=await context.newPage(),errors=[],trajectory=[],inputs=[],missions=[],markers=[];let epoch=Date.now(),audioOffsetSeconds=null;
let liveState=null,usingLive=false,socketGeneration=0,stateGeneration=0;const liveFrames=[],liveSent=new Map(),liveLatencies=[];
page.on('websocket',socket=>{
 if(!socket.url().endsWith('/api/live'))return;usingLive=true;const generation=++socketGeneration;
 socket.on('framesent',({payload})=>{const f=JSON.parse(String(payload));if(f.kind==='command')liveSent.set(`${generation}:${f.id}`,{at:performance.now(),command:f.command});});
 socket.on('framereceived',({payload})=>{const f=JSON.parse(String(payload));liveFrames.push(f);if(f.state){liveState=f.state;stateGeneration=generation;}if(f.kind==='ack'){const sent=liveSent.get(`${generation}:${f.id}`);if(sent)liveLatencies.push({id:f.id,type:sent.command.type,ms:performance.now()-sent.at});}});
});
function nextCommandResponse(){
 if(!usingLive)return page.waitForResponse(r=>r.url().endsWith('/api/command')&&r.request().method()==='POST',{timeout:3000});
 const after=liveFrames.length;return (async()=>{const deadline=performance.now()+3000;while(performance.now()<deadline){const f=liveFrames.slice(after).find(f=>f.kind==='ack'||f.kind==='error');if(f)return {status:()=>f.kind==='ack'?200:400,json:async()=>f.state??{error:f.error}};await new Promise(r=>setTimeout(r,5));}throw Error('Live command acknowledgement timed out.');})();
}
page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
async function read(){const s=usingLive?liveState:await page.evaluate(async()=>await(await fetch('/api/state')).json());if(!s)throw Error('No live state received.');trajectory.push({at:(Date.now()-epoch)/1000,levelId:s.levelId,status:s.status,elapsedMs:s.elapsedMs,player:s.player,sentries:s.sentries,carrying:s.carrying,grants:s.grants,event:s.event,message:s.message});return s;}
async function until(test,timeout=7000,label='condition'){let s,end=Date.now()+timeout;do{s=await read();if(test(s))return s;await page.waitForTimeout(20);}while(Date.now()<end);throw Error(`Timeout ${label}: ${JSON.stringify(s)}`);}
async function press(k){const done=nextCommandResponse();inputs.push({at:(Date.now()-epoch)/1000,key:k});await page.keyboard.press(k);const r=await done;assert.equal(r.status(),200);return r.json();}
async function click(name){const done=nextCommandResponse();await page.getByRole('button',{name,exact:true}).click();const r=await done;assert.equal(r.status(),200);await page.waitForTimeout(100);return r.json();}
async function go(level,to){let s=await read();assert.equal(s.status,'playing',s.message);const path=pathBetween(level,s.player,to);let i=0;while(i<path.length-1){const d=direction(path[i],path[i+1]);let j=i+1;while(j<path.length-1&&direction(path[j],path[j+1])===d)j++;await press(keys[d]);s=await until(s=>same(s.player,path[j])||s.status!=='playing',(j-i)*550+2500,`L${level.id} route ${key(path[j])}`);assert.equal(s.status,'playing',`L${level.id} ${s.message}`);i=j;}await press('Space');return read();}
async function save(name){await page.screenshot({path:`${output}/${name}.png`});}
try{
 await page.goto(base);await page.getByRole('button',{name:'Begin operation',exact:true}).waitFor();await save('00-title');
 if(recording){await page.getByRole('button',{name:'Mute audio',exact:true}).click();await page.getByRole('button',{name:'Enable audio',exact:true}).click();audioOffsetSeconds=(Date.now()-epoch)/1000;assert(await page.evaluate(()=>{if(!window.ghostProtocolAudioStream)return false;window.gpCaptureContext=new AudioContext();const bus=window.gpCaptureContext.createMediaStreamDestination();const source=window.gpCaptureContext.createMediaStreamSource(window.ghostProtocolAudioStream);source.connect(bus);const clock=window.gpCaptureContext.createConstantSource();clock.offset.value=0.00000001;clock.connect(bus);clock.start();void window.gpCaptureContext.resume();window.gpChunks=[];window.gpRecorder=new MediaRecorder(bus.stream,{mimeType:'audio/webm;codecs=opus'});window.gpRecorder.ondataavailable=e=>{if(e.data.size)window.gpChunks.push(e.data)};window.gpRecorder.start(250);return true;}));}
 await click('Begin operation');await page.getByRole('button',{name:'Skip introduction',exact:true}).waitFor();await page.waitForTimeout(recording?4200:250);await save('01-introduction');await page.getByRole('button',{name:'Skip introduction',exact:true}).click();
 for(let id=1;id<=5;id++){
  const level=getLevel(id);await page.getByRole('button',{name:'Begin mission',exact:true}).waitFor();
  const practiceMode=id===1?'borrowed':id===3?'expiry':id===4?'scopes':null;
  if(practiceMode){
   const before=await read(),savedBefore=await page.evaluate(()=>localStorage.getItem('ghost-protocol-campaign-v1'));
   assert.equal(before.status,'title');assert.equal(before.elapsedMs,0);
   const practice=page.locator(`[data-practice-mode="${practiceMode}"]`);await practice.waitFor();
   let exercise=createPractice(practiceMode);const checked=[];
   for(let step=0;step<PRACTICE_STEP_COUNTS[practiceMode];step++){
    assert.equal(await practice.getAttribute('data-practice-step'),String(step));
    const actual=await practice.locator('[data-allowed]').evaluateAll(rows=>rows.map(row=>({actor:row.getAttribute('data-actor'),resource:row.getAttribute('data-resource'),allow:row.getAttribute('data-allowed')==='true'})));
    assert.deepEqual(actual,exercise.decisions.map(({actor,resource,allow})=>({actor,resource,allow})));checked.push({step,decisions:actual});
    if(step<PRACTICE_STEP_COUNTS[practiceMode]-1){await practice.locator('.practice-next').click();exercise=advancePractice(exercise);}
   }
   await save(`practice-${practiceMode}-complete`);await practice.locator('.practice-replay').click();assert.equal(await practice.getAttribute('data-practice-step'),'0');
   const after=await read();assert.equal(after.elapsedMs,0);assert.equal(after.status,'title');assert.deepEqual(after.player,before.player);assert.deepEqual(after.grants,before.grants);assert.equal(await page.evaluate(()=>localStorage.getItem('ghost-protocol-campaign-v1')),savedBefore);
   practiceChecks.push({level:id,mode:practiceMode,steps:checked,reset:true,liveAttemptUnchanged:true});
  }
  await click('Begin mission');markers.push({level:id,start:(Date.now()-epoch)/1000});
  if(id===1){const a=await read();await page.waitForTimeout(950);const b=await read();assert.deepEqual(a.player,b.player);assert.notDeepEqual(a.sentries,b.sentries,'Sentries must move while player is idle');await press('Escape');const before=await read();await page.waitForTimeout(650);const after=await read();assert.equal(before.elapsedMs,after.elapsedMs);assert.deepEqual(before.sentries,after.sentries);await page.setViewportSize({width:1280,height:800});await save('verification-laptop-pause');assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);await page.setViewportSize({width:1920,height:1080});await click('Resume heist');await page.getByRole('button',{name:'Restart level',exact:true}).waitFor();await click('Restart level');await page.getByRole('heading',{name:'Restart this sector?',exact:true}).waitFor();await click('Restart heist');assert.deepEqual((await read()).player,level.start);
   if(interactionChecks){
    assert.equal(await page.locator('.interact-control').isDisabled(),true,'No action button without a reachable target');
    await press('e');assert.equal((await read()).event,'interaction-missed');await page.locator('[data-interaction-result="interaction-missed"]').waitFor();await save('14-no-empty-action');
    await go(level,{x:2,z:11});await until(s=>s.interactionLabel==='Collect Vault key');await page.getByRole('button',{name:'E Collect Vault key',exact:true}).first().waitFor();
    await press('e');assert((await read()).grants.some(g=>g.id==='vault'));await page.locator('[data-interaction-result="borrowed"]').waitFor();await save('15-key-action-confirmed');
    interactionResults.push({check:'Empty-floor control disabled; keyboard E explains missing target; reachable E collects named key with visible confirmation',passed:true});
    await click('Restart level');await click('Restart heist');
   }
   if(!recording){for(const [x,z]of CAMPAIGN_ROUTES[1]){await go(level,{x,z});if(level.objects.some(o=>o.type==='package'&&o.x===x&&o.z===z))break;}await until(s=>s.status==='lost',25000,'idle player captured');await page.getByRole('button',{name:'Try again',exact:true}).waitFor();await save('verification-loss');await click('Try again');assert.equal((await read()).carrying,false);}
  }
  if(id>=3){await page.keyboard.press('m');await page.waitForTimeout(80);}
  let route=CAMPAIGN_ROUTES[id];
  if(deliberate&&id===4){
   markers.at(-1).showcaseStart=(Date.now()-epoch)/1000;
   await page.locator('.device-guide summary').click();await page.waitForTimeout(2600);await save('09-device-guide');await page.locator('.device-guide summary').click();
   for(const [x,z,look]of [[3,13,1100],[1,13,500],[1,9,900],[5,9,1500],[3,9,600],[3,5,600],[3,9,600],[5,9,600]]){await go(level,{x,z});await page.waitForTimeout(look);}
   route=CAMPAIGN_ROUTES[4].slice(4);await save('10-two-keys');
  }
  let retries=0;
  while(true){try{
  for(const [x,z]of route){
   const target=level.objects.find(o=>o.x===x&&o.z===z);
   if(interactionChecks&&id===1&&target?.type==='console'){
    const gate=level.gates.find(g=>g.id==='gate-escape');await go(level,gate.a);const before=await read();assert.notEqual(before.contextObjectId,target.id);assert.equal(before.interactionLabel,null);await press('e');assert.equal((await read()).event,'interaction-missed');assert.equal((await read()).grant.revoked,false);interactionResults.push({level:id,check:'No lockdown action or revocation from archive side',passed:true});
   }
   let s=await go(level,{x,z});const object=level.objects.find(o=>o.x===x&&o.z===z);
   if(object?.type==='terminal'&&id===1)await save('02-maze-pathways');
   if(object?.type==='package'){assert(s.carrying);if(id===5)await save('03-three-pursuers');}
   if(object?.type==='renewal'){
    await press('e');
    if(interactionChecks){const renewed=await read();assert.equal(renewed.event,'renewed');await page.locator('[data-interaction-result="renewed"]').waitFor();interactionResults.push({level:id,check:'Named timer renewal confirms its result',grant:object.grantId,passed:true});}
   }
   if(object?.type==='console'){
    const before=await read();
    if(interactionChecks){assert.equal(before.interactionLabel,'Lock Vault behind you');assert.equal(before.contextObjectId,object.id);await page.locator('.lockdown-prompt').waitFor();await save(`door-${id}-ready`);}
    await press('e');const after=await read();
    if(interactionChecks){assert.notEqual(after.contextObjectId,object.id);await page.locator('[data-interaction-result="revoked"]').waitFor();await save(`door-${id}-locked`);interactionResults.push({level:id,check:'Visible named door action performed live lockdown, removed action and confirmed success',beforeLabel:before.interactionLabel,afterLabel:after.interactionLabel,passed:true});} assert.equal(after.status,'playing');assert(after.grants.find(g=>g.id===level.compromisedGrantId)?.revoked);assert.equal(await page.getByRole('dialog').count(),0,'Lockdown must not open a choice dialog');if(level.grants.length>1){assert.deepEqual(after.grants.find(g=>g.id==='transit'),before.grants.find(g=>g.id==='transit'));liveConsoleChecks.push({level:id,before,after,noDialog:true});}
    if(id===1||deliberate&&id===4){await until(s=>s.decisions.some(d=>s.sentries.some(enemy=>enemy.id===d.actor)&&!d.allow&&d.reason==='role revoked'),15000,'sentry denied at revoked gate');await save(id===4?'11-live-lockdown':'04-revoked-access');if(deliberate&&id===4){await page.waitForTimeout(1800);await go(level,{x:21,z:13});await save('12-transit-reader');await page.waitForTimeout(2000);await go(level,{x:21,z:11});}}
   }
  }
  break;
  }catch(error){const failed=await read();if(deliberate&&id===4&&retries===0&&failed.status==='lost'){markers.at(-1).captureAt=(Date.now()-epoch)/1000;await page.waitForTimeout(2400);await save('13-visible-restart');await click('Try again');route=CAMPAIGN_ROUTES[4];retries++;markers.at(-1).retryAt=(Date.now()-epoch)/1000;continue;}throw error;}}
  const won=await until(s=>s.status==='won',5000,`mission ${id} victory`);missions.push({levelId:id,elapsedMs:won.elapsedMs,chips:won.collectedShards.length,grants:won.grants,sentries:won.sentries,decisions:won.decisions});markers.at(-1).end=(Date.now()-epoch)/1000;
  assert(won.grants.find(g=>g.id===level.compromisedGrantId)?.revoked);await page.getByRole('button',{name:id<5?'Next mission':'Become the defender',exact:true}).waitFor();if(id===1||deliberate&&id===4){await page.waitForTimeout(400);await save('05-mission-debrief');await page.waitForTimeout(recording?1100:100);}
  console.log(`Mission ${id} won at ${won.elapsedMs}ms with ${won.sentries.length} sentries`);
  await click(id<5?'Next mission':'Become the defender');
 }
 await page.getByRole('button',{name:/Keep broad access/}).waitFor();
 const defender=[];for(const name of ['Keep broad access','Disable the shared key','Limit access to the job']){await click(new RegExp(name));const s=await read();defender.push(s.defender);if(name==='Keep broad access')assert.equal(s.defender.attackerDenied,false);if(name==='Disable the shared key')assert.equal(s.defender.maintenanceAllowed,false);if(name==='Limit access to the job')assert.equal(s.defender.success,true);await page.waitForTimeout(recording?1600:100);}
 await save('06-defender-lab');await page.locator('.defender-evidence summary').click();await page.waitForTimeout(recording?2600:100);await save('08-policy-evidence');await page.getByRole('button',{name:'Complete the campaign',exact:true}).click();await save('07-campaign-complete');
 const progress=await page.evaluate(()=>JSON.parse(localStorage.getItem('ghost-protocol-campaign-v1')));assert.equal(Object.keys(progress.results).length,5);assert.equal(progress.defenderComplete,true);
 if(recording){const bytes=await page.evaluate(async()=>{if(!window.gpRecorder)return null;await new Promise(resolve=>{window.gpRecorder.onstop=resolve;window.gpRecorder.stop()});return Array.from(new Uint8Array(await new Blob(window.gpChunks,{type:'audio/webm'}).arrayBuffer()))});if(bytes)await fs.writeFile(`${output}/raw/gameplay-audio.webm`,Buffer.from(bytes));}
 const performanceBeforeReload=await page.evaluate(()=>window.ghostProtocolRenderStats),reloadChecks=[];
 if(usingLive){
  await page.getByRole('button',{name:'Replay the campaign',exact:true}).click();
  await click('Replay '+getLevel(1).title);await click('Begin mission');
  const runId=(await read()).runId;
  for(let attempt=0;attempt<3;attempt++){
   const generation=socketGeneration,started=performance.now();liveState=null;
   await page.reload();
   const deadline=performance.now()+10000;
   while(!(liveState&&stateGeneration>generation)&&performance.now()<deadline)await page.waitForTimeout(25);
   assert(liveState&&stateGeneration>generation,'Reload never received a fresh socket state');
   assert.equal(liveState.runId,runId);assert.equal(liveState.status,'paused');
   await page.waitForFunction(()=>[...document.querySelectorAll('button')].some(b=>b.textContent.includes('Resume heist')&&!b.disabled));
   const readyMs=performance.now()-started;
   await click('Resume heist');assert.equal((await read()).status,'playing');
   await press('Escape');assert.equal((await read()).status,'paused');
   reloadChecks.push({attempt:attempt+1,newSocket:true,preservedRun:true,paused:true,resumeAndPauseAcknowledged:true,readyMs});
  }
 }else{await page.reload();await page.waitForTimeout(350);}
 const restored=await page.evaluate(()=>JSON.parse(localStorage.getItem('ghost-protocol-campaign-v1')));assert.deepEqual(restored,progress,'Reload changed saved progress or double-counted completion');
 await context.storageState({path:output+'/earned-storage-state.json'});
 await fs.writeFile(output+'/pre-idle-state.json',JSON.stringify({runId:liveState?.runId,status:liveState?.status,levelId:liveState?.levelId,progress},null,2)+'\n');
 await save('reload-connected');
 const stats=await page.evaluate(()=>window.ghostProtocolRenderStats);
 const receipt={reloadChecks,transport:usingLive?'websocket':'http',liveLatencies,base,browser:await browser.version(),recording,deliberate,interactionResults,liveConsoleChecks,practiceChecks,audioOffsetSeconds,durationSeconds:(Date.now()-epoch)/1000,markers,missions,defender,progress,stats:performanceBeforeReload??stats,errors,inputMethod:'Actual keyboard and UI buttons, guided only by observed public connection snapshots. No actor or progress injection.',inputs,trajectory};
 await fs.writeFile(`${output}/browser-verification.json`,JSON.stringify(receipt,null,2)+'\n');assert.deepEqual(errors,[]);console.log(JSON.stringify({passed:true,missions:missions.length,defender:true,persistence:true,stats,errors}));
 const video=page.video();await page.close();await context.close();if(video)await video.saveAs(`${output}/full-campaign-gameplay.webm`);
}catch(error){await save('verification-failure').catch(()=>{});await fs.writeFile(`${output}/verification-failure.json`,JSON.stringify({message:error.message,state:await read().catch(()=>null),errors,missions,inputs,trajectory},null,2));throw error;}finally{await browser.close();}
