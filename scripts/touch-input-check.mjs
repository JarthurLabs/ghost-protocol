import {chromium} from 'playwright';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
const base=process.env.GHOST_PROTOCOL_BASE||'http://127.0.0.1:5325';
const output=process.env.GHOST_PROTOCOL_CAPTURE_DIR||'captures/touch-response-review';
await fs.mkdir(output,{recursive:true});
const browser=await chromium.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true,args:['--use-gl=angle','--use-angle=metal']});
const context=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true,deviceScaleFactor:2});
// Hardware boundary only: observe vibration requests; this cannot prove a physical buzz.
await context.addInitScript(()=>{window.vibrationRequests=[];Object.defineProperty(navigator,'vibrate',{configurable:true,value:duration=>{window.vibrationRequests.push(duration);return true;}});});
const page=await context.newPage(),sent=[],errors=[];let state=null;
page.on('pageerror',e=>errors.push(e.message));
page.on('websocket',socket=>{
 socket.on('framesent',({payload})=>{const f=JSON.parse(String(payload));if(f.kind==='command')sent.push({at:performance.now(),...f.command});});
 socket.on('framereceived',({payload})=>{const f=JSON.parse(String(payload));if(f.state)state=f.state;});
});
const waitFor=async predicate=>{const end=performance.now()+5000;while(performance.now()<end){if(predicate())return;await page.waitForTimeout(10);}throw Error('Input was not observed');};
const center=async selector=>{const b=await page.locator(selector).boundingBox();return{x:b.x+b.width/2,y:b.y+b.height/2};};
const moves=()=>sent.filter(c=>c.type==='move');
try{
 await page.goto(base);await page.getByRole('button',{name:'Begin operation',exact:true}).tap();await page.getByRole('button',{name:'Skip introduction',exact:true}).tap();await page.getByRole('button',{name:'Begin mission',exact:true}).tap();await waitFor(()=>state?.status==='playing');
 const east=await center('.key-button.east'),north=await center('.key-button.north'),west=await center('.key-button.west');
 await page.mouse.move(east.x,east.y);const began=performance.now();await page.mouse.down();await page.waitForTimeout(100);
 assert.equal(moves().at(-1)?.direction,'east','Steering is sent on finger-down, before release');
 const dispatchMs=moves().at(-1).at-began;
 await page.mouse.move(north.x,north.y,{steps:3});await waitFor(()=>moves().at(-1)?.direction==='north');
 await page.mouse.move(west.x,west.y,{steps:3});await waitFor(()=>moves().at(-1)?.direction==='west');
 const beforeRelease=moves().length;await page.mouse.up();await page.waitForTimeout(150);assert.equal(moves().length,beforeRelease,'Release does not replay an old direction');
 const beforeTap=moves().length;await page.getByRole('button',{name:'Move east',exact:true}).tap();await waitFor(()=>moves().length>beforeTap);await page.waitForTimeout(100);assert.equal(moves().length,beforeTap+1,'Native touch tap sends exactly once');
 const pulses=await page.evaluate(()=>window.vibrationRequests);assert(pulses.length>=1,'Touch direction requests a haptic pulse');assert(pulses.every(ms=>ms>0&&ms<=15),'Direction feedback stays a short pulse');
 await page.getByRole('button',{name:'Brake',exact:true}).tap();await waitFor(()=>state.direction===null&&state.queuedDirection===null);
 await page.getByRole('button',{name:'Pause',exact:true}).tap();await page.getByRole('button',{name:'Touch vibration',exact:true}).tap();await page.getByRole('button',{name:'Resume heist',exact:true}).tap();await waitFor(()=>state.status==='playing');
 const pulseCount=await page.evaluate(()=>window.vibrationRequests.length);await page.getByRole('button',{name:'Move west',exact:true}).tap();await page.waitForTimeout(100);assert.equal(await page.evaluate(()=>window.vibrationRequests.length),pulseCount,'The vibration setting is respected');
 await page.getByRole('button',{name:'Brake',exact:true}).tap();await page.getByRole('button',{name:'Pause',exact:true}).tap();await page.getByRole('button',{name:'Touch vibration',exact:true}).tap();await page.getByRole('button',{name:'Resume heist',exact:true}).tap();await waitFor(()=>state.status==='playing');
 await page.evaluate(()=>Object.defineProperty(navigator,'vibrate',{value:()=>{throw Error('Hardware unavailable');}}));const beforeFailure=moves().length;await page.getByRole('button',{name:'Move east',exact:true}).tap();await waitFor(()=>moves().length>beforeFailure);assert.equal(moves().at(-1).direction,'east');
 await page.getByRole('button',{name:'Brake',exact:true}).tap();
 await page.evaluate(()=>Object.defineProperty(navigator,'vibrate',{value:undefined}));await page.getByRole('button',{name:'Pause',exact:true}).tap();assert(await page.getByRole('button',{name:'Touch vibration',exact:true}).isDisabled());assert(await page.getByText('Unavailable in this browser',{exact:true}).isVisible());await page.getByRole('button',{name:'Resume heist',exact:true}).tap();await waitFor(()=>state.status==='playing');
 await page.screenshot({path:`${output}/responsive-directions.png`});
 assert.deepEqual(errors,[]);const receipt={base,dispatchMs,commands:sent,errors,pointerDownBeforeRelease:true,slideChanges:true,noReleaseReplay:true,nativeTouchOnce:true,hapticRequestObserved:true,hapticsOffRespected:true,hapticFailureDoesNotBlockSteering:true,physicalVibrationVerified:false};await fs.writeFile(`${output}/input-verification.json`,JSON.stringify(receipt,null,2));console.log(JSON.stringify(receipt));
}finally{await browser.close();}
