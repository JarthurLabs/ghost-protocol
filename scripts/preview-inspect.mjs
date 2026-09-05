import { chromium } from 'playwright';
import fs from 'node:fs/promises';
const browser=await chromium.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true,args:['--use-gl=angle','--use-angle=metal']});
const context=await browser.newContext({viewport:{width:1920,height:1080},deviceScaleFactor:1});
const page=await context.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text())});
await page.goto('http://127.0.0.1:5320');await page.waitForTimeout(3000);
await page.screenshot({path:'captures/inspection-title.png'});
console.log(JSON.stringify({title:await page.title(),body:(await page.locator('body').innerText()).slice(0,6500),errors,stats:await page.evaluate(()=>window.ghostProtocolRenderStats)},null,2));
await browser.close();
