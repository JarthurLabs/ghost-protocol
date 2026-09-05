import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
const output=process.env.GHOST_PROTOCOL_CAPTURE_DIR || 'captures/clearer-devices';
await fs.mkdir(output,{recursive:true});
const browser=await chromium.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true,args:['--use-gl=angle','--use-angle=metal']});
const page=await browser.newPage({viewport:{width:1280,height:800}});const errors=[];page.on('pageerror',e=>errors.push(e.message));
try{
  await page.goto(process.env.GHOST_PROTOCOL_BASE||'http://127.0.0.1:5320');await page.getByRole('button',{name:'Begin operation',exact:true}).click();await page.getByRole('button',{name:'Skip introduction',exact:true}).click();await page.getByRole('button',{name:'Begin mission',exact:true}).click();await page.getByRole('complementary',{name:'Current objective',exact:true}).waitFor();await page.waitForTimeout(1600);
  await page.evaluate(async()=>{
    const ctx=new AudioContext();await ctx.resume();const source=ctx.createMediaStreamSource(window.ghostProtocolAudioStream);const analyser=ctx.createAnalyser();analyser.fftSize=2048;source.connect(analyser);
    window.audioProbe={ctx,analyser};window.sampleMusic=async(ms=1400)=>{const values=[];const end=performance.now()+ms;const wave=new Float32Array(2048);while(performance.now()<end){analyser.getFloatTimeDomainData(wave);values.push(Math.sqrt(wave.reduce((sum,x)=>sum+x*x,0)/wave.length));await new Promise(r=>setTimeout(r,40));}return{rms:Math.sqrt(values.reduce((sum,x)=>sum+x*x,0)/values.length),peakRms:Math.max(...values),frames:values.length};};
  });
  const measure=()=>page.evaluate(()=>window.sampleMusic());
  const diagnostics=()=>page.evaluate(()=>window.ghostProtocolAudioDiagnostics());
  const state=()=>page.evaluate(async()=>await(await fetch('/api/state')).json());
  const idle=await measure();assert.equal((await diagnostics()).activeSchedulers,1);assert(idle.rms>.001,`No audible music while idle: ${idle.rms}`);assert.equal((await state()).turn,0);
  await page.keyboard.press('Escape');await page.getByRole('heading',{name:'Ghost on standby.',exact:true}).waitFor();await page.waitForTimeout(1500);
  const paused=await measure();assert.equal((await diagnostics()).activeSchedulers,0);assert(paused.rms<.0001,`Pause left audio running: ${paused.rms}`);assert.equal((await state()).turn,0);
  const effects=page.getByRole('button',{name:'Sound effects',exact:true});const music=page.getByRole('button',{name:'Music',exact:true});
  await effects.click();await music.click();assert.equal(await effects.getAttribute('aria-pressed'),'false');assert.equal(await music.getAttribute('aria-pressed'),'false');
  const volume=page.getByRole('slider',{name:'Music volume',exact:true});await volume.press('Home');for(let i=0;i<6;i++)await volume.press('ArrowRight');assert.equal(await volume.inputValue(),'30');
  await page.screenshot({path:output+'/sound-controls.png'});
  await page.keyboard.press('Escape');await page.waitForTimeout(800);assert.equal((await state()).status,'playing','Escape should resume when the volume slider has focus');const mutedMusic=await measure();assert(mutedMusic.rms<.0001,`Music toggle not silent: ${mutedMusic.rms}`);
  await page.keyboard.press('Escape');await page.waitForTimeout(250);await music.click();await page.keyboard.press('Escape');await page.waitForTimeout(1000);const musicOnly=await measure();assert(musicOnly.rms>.0004,`Music missing with effects disabled: ${musicOnly.rms}`);
  await page.getByRole('button',{name:'Mute audio',exact:true}).click();await page.waitForTimeout(800);const masterMuted=await measure();assert(masterMuted.rms<.0001,`Master mute leaks: ${masterMuted.rms}`);
  await page.getByRole('button',{name:'Enable audio',exact:true}).click();await page.waitForTimeout(1000);const resumed=await measure();assert(resumed.rms>.0004);
  // Repeated valid no-op interactions unlock audio without advancing a turn.
  await page.locator('canvas').click({position:{x:400,y:300}});for(let i=0;i<8;i++){await page.keyboard.press('e');await page.waitForTimeout(220);}assert.equal((await state()).turn,0);
  const afterUnlocks=await measure();const afterUnlockDiagnostics=await diagnostics();assert.equal(afterUnlockDiagnostics.activeSchedulers,1);assert(afterUnlocks.rms<.15,`Repeated unlocks unexpectedly amplified music: ${afterUnlocks.rms}`);
  await page.reload();await page.getByRole('complementary',{name:'Current objective',exact:true}).waitFor();await page.keyboard.press('Escape');await page.getByRole('slider',{name:'Music volume',exact:true}).waitFor();assert.equal(await page.getByRole('slider',{name:'Music volume',exact:true}).inputValue(),'30');assert.equal(await page.getByRole('button',{name:'Sound effects',exact:true}).getAttribute('aria-pressed'),'false');assert.equal(await page.getByRole('button',{name:'Music',exact:true}).getAttribute('aria-pressed'),'true');
  assert.deepEqual(errors,[]);const result={browser:await browser.version(),idle,paused,mutedMusic,musicOnly,masterMuted,resumed,afterUnlocks,afterUnlockDiagnostics,settingsPersisted:true,turnStayedZero:true,errors};await fs.writeFile(output+'/audio-verification.json',JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result,null,2));
}finally{await browser.close();}
