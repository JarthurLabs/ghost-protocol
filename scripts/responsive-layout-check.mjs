import {chromium} from 'playwright';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
const base=process.env.GHOST_PROTOCOL_BASE||'http://127.0.0.1:5324';
const output=process.env.GHOST_PROTOCOL_CAPTURE_DIR||'captures/mobile-review/layouts';
await fs.mkdir(output,{recursive:true});
const browser=await chromium.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true,args:['--use-gl=angle','--use-angle=metal']});
const checks=[],errors=[];
try{
 const mobile=await browser.newContext({viewport:{width:320,height:568},deviceScaleFactor:2,isMobile:true,hasTouch:true});
 const page=await mobile.newPage();page.on('pageerror',e=>errors.push(e.message));
 await page.goto(base);await page.getByRole('button',{name:'Begin operation',exact:true}).tap();
 await page.getByRole('button',{name:'Next chapter',exact:true}).tap();await page.waitForTimeout(100);
 assert(await page.locator('#briefing-heading').evaluate(el=>el.getBoundingClientRect().top>=0),'A new phone introduction chapter starts at its heading');await page.screenshot({path:`${output}/intro.png`});
 assert.equal(await page.locator('.intro-forward').evaluate(el=>el.scrollWidth>el.clientWidth),false,'Introduction actions fit the smallest phone');
 await page.getByRole('button',{name:'Skip introduction',exact:true}).tap();
 assert.match(await page.locator('.brief-controls').innerText(),/Directions/);await page.getByRole('button',{name:'Begin mission',exact:true}).tap();
 for(const [width,height]of[[320,568],[375,667],[390,844],[844,390],[568,320],[1024,768]]){
  await page.setViewportSize({width,height});await page.waitForTimeout(500);
  const data=await page.evaluate(()=>{const rect=s=>{const r=document.querySelector(s).getBoundingClientRect();return{x:r.x,y:r.y,right:r.right,bottom:r.bottom,width:r.width,height:r.height};};return{game:rect('.game'),scene:rect('.scene-shell'),objective:rect('.objective-card'),status:rect('.status-stack'),buttons:[...document.querySelectorAll('.key-button,.control-action')].map(e=>{const r=e.getBoundingClientRect();return{x:r.x,y:r.y,right:r.right,bottom:r.bottom,width:r.width,height:r.height};}),labels:[...document.querySelectorAll('[data-device-label]')].filter(e=>getComputedStyle(e).display!=='none').length,scroll:document.documentElement.scrollWidth>innerWidth};});
  assert.equal(data.game.height,height,'The game follows the dynamic viewport height');assert(!data.scroll);assert(data.scene.height>=130);
  for(const r of data.buttons){assert(r.width>=52&&r.height>=52);assert(r.x>=0&&r.y>=0&&r.right<=width&&r.bottom<=height);assert(r.right<=data.scene.x||r.x>=data.scene.right||r.bottom<=data.scene.y||r.y>=data.scene.bottom,'Touch controls must be outside the maze');}
  assert(data.objective.bottom<=data.status.y+1||data.objective.right<=data.status.x+1,`${width}×${height}: objective and key strip must not overlap`);
  assert(data.labels>0,'Nearby device labels remain visible on small phones');
  await page.screenshot({path:`${output}/${width}x${height}.png`});checks.push({width,height,...data});
 }
 await mobile.close();
 const desktop=await browser.newContext({viewport:{width:1920,height:1080}}),pc=await desktop.newPage();pc.on('pageerror',e=>errors.push(e.message));
 await pc.goto(base);await pc.getByRole('button',{name:'Begin operation',exact:true}).click();await pc.getByRole('button',{name:'Skip introduction',exact:true}).click();await pc.getByRole('button',{name:'Begin mission',exact:true}).click();
 await pc.waitForFunction(()=>document.querySelector('.key-button.east')?.disabled===false);
 assert.equal(await pc.locator('.touch-layout').count(),0);assert.equal(await pc.locator('.key-button.north').innerText(),'W');
 await pc.keyboard.press('d');
 await pc.waitForFunction(()=>document.querySelector('.access-status strong')?.textContent.includes('seconds left'));
 await pc.keyboard.press('Space');await pc.screenshot({path:`${output}/desktop-1920x1080.png`});await pc.keyboard.press('Escape');await pc.getByRole('button',{name:'Resume heist',exact:true}).waitFor();
 checks.push({desktopKeyboardMovement:true,desktopPause:true,touchLayoutAbsent:true});assert.deepEqual(errors,[]);
 await fs.writeFile(`${output}/verification.json`,JSON.stringify({base,checks,errors},null,2));console.log(JSON.stringify({passed:true,viewports:checks.length,errors}));
}finally{await browser.close();}
