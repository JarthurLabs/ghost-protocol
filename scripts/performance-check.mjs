import { chromium } from 'playwright';
const browser=await chromium.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true,args:['--use-gl=angle','--use-angle=metal']});
const page=await browser.newPage({viewport:{width:1920,height:1080}});await page.goto('http://127.0.0.1:5320');await page.getByRole('button',{name:'Start heist',exact:true}).click();await page.waitForTimeout(8000);
console.log(await page.evaluate(()=>{const gl=document.querySelector('canvas').getContext('webgl2');const ext=gl.getExtension('WEBGL_debug_renderer_info');return{stats:window.ghostProtocolRenderStats,gpu:ext?gl.getParameter(ext.UNMASKED_RENDERER_WEBGL):'unavailable'}}));await page.screenshot({path:'captures/inspection-gameplay.png'});await browser.close();
