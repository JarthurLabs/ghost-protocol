import {chromium} from 'playwright';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {getLevel} from '../shared/level.ts';
import {CAMPAIGN_ROUTES} from '../tests/campaign-routes.ts';

const base=process.env.GHOST_PROTOCOL_BASE||'http://127.0.0.1:5324';
const output=process.env.GHOST_PROTOCOL_CAPTURE_DIR||'captures/mobile-review';
const browser=await chromium.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true,args:['--use-gl=angle','--use-angle=metal']});
const context=await browser.newContext({viewport:{width:390,height:844},deviceScaleFactor:2,isMobile:true,hasTouch:true});
const missionId=Number(process.env.GHOST_PROTOCOL_MOBILE_LEVEL||1);
if(missionId>1)await context.addInitScript(id=>localStorage.setItem('ghost-protocol-campaign-v1',JSON.stringify({version:1,introSeen:true,results:Object.fromEntries(Array.from({length:id-1},(_,i)=>[i+1,{bestMs:60000,bestChips:0,completions:1}]))})),missionId);
const page=await context.newPage(),errors=[],checks=[];
page.on('pageerror',error=>errors.push(error.message));
let latest=null;
page.on('websocket',socket=>socket.on('framereceived',({payload})=>{const frame=JSON.parse(String(payload));if(frame.state)latest=frame.state;}));
const read=async()=>latest||page.evaluate(async()=>await(await fetch('/api/state')).json());
async function until(predicate,timeout=6000){const end=Date.now()+timeout;let state;do{state=await read();if(predicate(state))return state;await page.waitForTimeout(20);}while(Date.now()<end);throw Error(`State timeout: ${JSON.stringify(state)}`);}
const tap=async name=>page.getByRole('button',{name,exact:true}).tap();
const same=(a,b)=>a.x===b.x&&a.z===b.z,key=p=>`${p.x},${p.z}`;
const deltas={north:{x:0,z:-1},east:{x:1,z:0},south:{x:0,z:1},west:{x:-1,z:0}};
function route(level,from,to){const tiles=new Map(level.tiles.map(t=>[key(t),t])),queue=[[from]],seen=new Set([key(from)]);for(const path of queue){const a=path.at(-1);if(same(a,to))return path;for(const d of Object.values(deltas)){const b={x:a.x+d.x,z:a.z+d.z},ta=tiles.get(key(a)),tb=tiles.get(key(b));if(seen.has(key(b))||!tb||!(ta.zone===tb.zone||level.gates.some(g=>(same(g.a,a)&&same(g.b,b))||(same(g.b,a)&&same(g.a,b)))))continue;seen.add(key(b));queue.push([...path,b]);}}throw Error('No route');}
const direction=(a,b)=>b.x>a.x?'east':b.x<a.x?'west':b.z>a.z?'south':'north';
async function go(level,to){const path=route(level,(await read()).player,to);let i=0;while(i<path.length-1){const d=direction(path[i],path[i+1]);let j=i+1;while(j<path.length-1&&direction(path[j],path[j+1])===d)j++;await tap(`Move ${d}`);const s=await until(s=>same(s.player,path[j])||s.status!=='playing',(j-i)*600+2500);assert.equal(s.status,'playing',s.message);i=j;}await page.locator('.brake-control').tap();}
async function layout(name){await page.waitForTimeout(500);await page.screenshot({path:`${output}/${name}.png`});const data=await page.evaluate(()=>{const box=s=>{const e=document.querySelector(s),r=e.getBoundingClientRect();return{x:r.x,y:r.y,width:r.width,height:r.height,right:r.right,bottom:r.bottom};};return{viewport:{width:innerWidth,height:innerHeight},controls:['north','west','south','east'].map(d=>box(`.key-button.${d}`)),scene:box('.scene-shell'),objective:box('.objective-card'),dock:box('.bottom-bar'),scroll:document.documentElement.scrollWidth>innerWidth};});for(const b of data.controls){assert(b.width>=52&&b.height>=52,`${name}: touch direction target ${b.width}×${b.height}, expected at least 52`);assert(b.x>=0&&b.y>=0&&b.right<=data.viewport.width&&b.bottom<=data.viewport.height);}assert(!data.scroll);for(const button of data.controls){assert(button.right<=data.scene.x||button.x>=data.scene.right||button.bottom<=data.scene.y||button.y>=data.scene.bottom,`${name}: maze and control overlap`);}checks.push({name,...data});}
await fs.mkdir(output,{recursive:true});
try{
 await page.goto(base);await tap(missionId===1?'Begin operation':'Continue operation');if(missionId===1)await tap('Skip introduction');await tap('Begin mission');await until(s=>s.status==='playing');
 await layout('01-phone-start');
 if(process.env.GHOST_PROTOCOL_LAYOUT_ONLY!=='1'){
 const level=getLevel(missionId);
 for(const [x,z] of CAMPAIGN_ROUTES[missionId]){
  await go(level,{x,z});const object=level.objects.find(o=>o.x===x&&o.z===z);
  if(object?.type==='package'){
   assert((await read()).carrying);await page.screenshot({path:`${output}/02-package-collected.png`});
  }
  if(object?.type==='renewal')await page.locator('.interact-control').tap();
  if(object?.type==='console'){
   await page.locator('.interact-control').tap();await until(s=>s.grants.some(g=>g.id==='vault'&&g.revoked));
   await page.waitForTimeout(4100);
   assert.equal(await page.locator('.message-text').count(),0,'A stale package/status message must expire');
   await layout('03-vault-locked');
   await page.setViewportSize({width:844,height:390});await layout('04-phone-landscape');
   await page.setViewportSize({width:375,height:667});await layout('05-small-phone');
   await page.setViewportSize({width:390,height:844});
  }
 }
 await until(s=>s.status==='won');checks.push({touchOnlyMissionWon:true});
 await tap('Next mission');await tap('Begin mission');await until(s=>s.status==='playing');
 await tap('Restart level');await tap('Restart heist');assert(same((await read()).player,getLevel(missionId+1).start));
 await tap('Pause');const paused=await until(s=>s.status==='paused');await page.waitForTimeout(500);assert.equal((await read()).elapsedMs,paused.elapsedMs);await page.screenshot({path:`${output}/06-phone-pause.png`});
 checks.push({restart:true,pauseFreezesClock:true});
 }
 assert.deepEqual(errors,[]);
 await fs.writeFile(`${output}/verification.json`,JSON.stringify({base,checks,errors,device:'Chrome phone emulation, not a physical phone'},null,2));
 console.log(JSON.stringify({passed:true,checks:checks.map(c=>c.name||c),errors},null,2));
}finally{await browser.close();}
