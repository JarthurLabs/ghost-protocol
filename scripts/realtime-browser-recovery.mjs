import {chromium} from 'playwright';
import fs from 'node:fs/promises';
const browser=await chromium.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true,args:['--use-gl=angle','--use-angle=metal']});
const results={},base=process.env.GHOST_PROTOCOL_BASE||'http://127.0.0.1:5322';
try{
 const stalled=await browser.newPage();let release;
 await stalled.route('**/api/transport',route=>new Promise(resolve=>{release=()=>{void route.abort().finally(resolve);};}));
 await stalled.goto(base);
 results.startupTimeout=await stalled.getByRole('heading',{name:'Connection interrupted.',exact:true}).waitFor({timeout:5500}).then(()=>true,()=>false);release?.();await stalled.close();
 const context=await browser.newContext({viewport:{width:1920,height:1080}}),page=await context.newPage();
 const socketFrames=[];page.on('websocket',socket=>socket.on('framereceived',({payload})=>socketFrames.push(JSON.parse(String(payload)))));
 await page.goto(base);await page.getByRole('button',{name:'Begin operation',exact:true}).waitFor();await page.waitForTimeout(100);
 await page.getByRole('button',{name:'Begin operation',exact:true}).click();await page.getByRole('button',{name:'Skip introduction',exact:true}).click();await page.getByRole('button',{name:'Begin mission',exact:true}).click();
 await page.getByRole('button',{name:'Restart level',exact:true}).waitFor();await page.waitForTimeout(2200);
 results.render=await page.evaluate(()=>({stats:window.ghostProtocolRenderStats,now:performance.now(),visibility:document.visibilityState,canvas:document.querySelector('canvas')?.getBoundingClientRect().toJSON()}));
 results.frames=await page.evaluate(()=>new Promise(resolve=>{const times=[];const start=performance.now();const frame=now=>{times.push(now);if(times.length>=30)resolve({elapsed:performance.now()-start,first:times[0],last:now});else requestAnimationFrame(frame);};requestAnimationFrame(frame);}));
 await page.keyboard.press('Escape');await page.getByRole('button',{name:'Resume heist',exact:true}).waitFor();
 await context.setOffline(true);await page.getByRole('button',{name:'Reconnect',exact:true}).waitFor({timeout:7000});
 results.keyboardReconnect=false;
 for(let i=0;i<8;i++){await page.keyboard.press('Tab');if(await page.getByRole('button',{name:'Reconnect',exact:true}).evaluate(e=>e===document.activeElement)){results.keyboardReconnect=true;break;}}
 await context.setOffline(false);
 await page.getByRole('button',{name:'Reconnect',exact:true}).click();await page.getByRole('button',{name:'Reconnect',exact:true}).waitFor({state:'hidden',timeout:5000});
 results.reconnectedPaused=await page.getByRole('button',{name:'Resume heist',exact:true}).isVisible();
 await page.getByRole('button',{name:'Resume heist',exact:true}).click();await page.getByRole('button',{name:'Resume heist',exact:true}).waitFor({state:'hidden'});
 results.resumed=socketFrames.filter(f=>f.state).at(-1)?.state.status==='playing';
 await page.screenshot({path:'.runtime/realtime-recovery.png'});await context.close();
 await fs.writeFile('.runtime/realtime-recovery.json',JSON.stringify(results,null,2));console.log(JSON.stringify(results));
 if(!results.startupTimeout||!results.keyboardReconnect||!results.reconnectedPaused||!results.resumed)process.exitCode=1;
}finally{await browser.close();}
