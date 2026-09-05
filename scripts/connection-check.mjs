import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
const browser=await chromium.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true,args:['--use-gl=angle','--use-angle=metal']});
const context=await browser.newContext({viewport:{width:1280,height:800}});
const page=await context.newPage();const held=[];
try {
  await page.goto(process.env.GHOST_PROTOCOL_BASE||'http://127.0.0.1:5320');
  await page.getByRole('button',{name:'Begin operation',exact:true}).click();await page.getByRole('button',{name:'Skip introduction',exact:true}).click();await page.getByRole('button',{name:'Begin mission',exact:true}).click();await page.getByRole('complementary',{name:'Current objective',exact:true}).waitFor();
  await page.waitForTimeout(250);
  await page.route('**/api/command',route=>{held.push(route);});
  await page.keyboard.press('d');
  await page.waitForTimeout(5500);
  assert(await page.getByRole('heading',{name:'Ghost on standby.',exact:true}).isVisible(),'A stalled command must time out, release polling, and show the server autopause');
  for(const route of held)await route.abort().catch(()=>{});
  await page.unroute('**/api/command');
  const resumed=page.waitForResponse(response=>response.url().endsWith('/api/command'));
  await page.getByRole('button',{name:'Resume heist',exact:true}).click();
  await resumed;
  await page.getByRole('heading',{name:'Ghost on standby.',exact:true}).waitFor({state:'hidden'});
  await page.keyboard.press('d');await page.waitForTimeout(500);
  const state=await page.evaluate(async()=>await(await fetch('/api/state')).json());
  assert.equal(state.status,'playing');assert(state.turn>=2,'Movement did not recover without reloading');
  await page.keyboard.press('Escape');
  await fs.writeFile('captures/clearer-devices/connection-verification.json',JSON.stringify({stalledCommandReleased:true,serverAutoPauseShown:true,resumeWithoutReload:true,playerAfterRecovery:state.player,movesAfterRecovery:state.turn},null,2)+'\n');
  console.log('PASS stalled command timeout, server autopause, resume and movement without reload');
} finally {for(const route of held)await route.abort().catch(()=>{});await context.close();await browser.close();}
