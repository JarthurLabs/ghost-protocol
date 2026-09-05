import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
const url=process.env.GHOST_PROTOCOL_URL||'http://127.0.0.1:5322';
const output=process.env.GHOST_PROTOCOL_CAPTURE_DIR||'captures/finished-game/learning';
const phase=process.env.GHOST_PROTOCOL_LEARNING_PHASE||'all';
await fs.mkdir(output,{recursive:true});
if(phase!=='defender'){
  const newcomerOutput=`${output}/newcomer`;
  await new Promise((resolve,reject)=>{const child=spawn(process.execPath,[...process.execArgv,fileURLToPath(new URL('./newcomer-check.mjs',import.meta.url))],{stdio:'inherit',env:{...process.env,GHOST_PROTOCOL_URL:url,GHOST_PROTOCOL_CAPTURE_DIR:newcomerOutput}});child.once('error',reject);child.once('exit',code=>code===0?resolve():reject(new Error(`Newcomer verification exited ${code}`)));});
  if(phase==='intro')process.exit(0);
}
const browser=await chromium.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true,args:['--use-gl=angle','--use-angle=metal']});
const errors=[],requests=[],results={url,browser:await browser.version(),evidenceScope:'Bounded real defender policy checks from the public defender-start command in an isolated session. Non-defender phases also run the separate newcomer script and its receipt. Neither fixture establishes campaign traversal or measured human learning.'};
const watch=page=>{page.setDefaultTimeout(15000);page.setDefaultNavigationTimeout(15000);page.on('pageerror',error=>errors.push(error.message));page.on('response',response=>{if(response.url().endsWith('/api/command'))requests.push(response.json().then(body=>({status:response.status(),command:response.request().postDataJSON(),body})));});};
const serverState=page=>page.evaluate(async()=>await(await fetch('/api/state')).json());
const layout=page=>page.locator('.learning-panel').evaluate(panel=>({width:panel.clientWidth,height:panel.clientHeight,scrollWidth:panel.scrollWidth,scrollHeight:panel.scrollHeight,viewport:{width:innerWidth,height:innerHeight},bounds:{x:panel.getBoundingClientRect().x,y:panel.getBoundingClientRect().y,right:panel.getBoundingClientRect().right,bottom:panel.getBoundingClientRect().bottom}}));
const screenshot=async(page,name)=>{await page.screenshot({path:`${output}/${name}.png`});const frame=await layout(page);assert(frame.scrollWidth<=frame.width+1,`${name}: horizontal panel overflow`);assert(frame.bounds.x>=0&&frame.bounds.right<=frame.viewport.width+1,`${name}: panel outside viewport`);return frame;};
try{
  if(phase!=='intro'){

  const defenderContext=await browser.newContext({viewport:{width:1280,height:800}});
  await defenderContext.request.get(url+'/api/state');
  const setup=await defenderContext.request.post(url+'/api/command',{headers:{Origin:url},data:{type:'defender-start'}});assert.equal(setup.status(),200);results.defenderSetup=await setup.json();
  const defender=await defenderContext.newPage();watch(defender);await defender.goto(url);await defender.locator('.defender-panel').waitFor();
  assert(await defender.getByRole('button',{name:'Complete the campaign',exact:false}).isDisabled());results.defenderReadyLayout1280=await screenshot(defender,'07-defender-ready-1280');
  await defender.getByRole('button',{name:'Back to missions',exact:false}).focus();await defender.keyboard.press('Shift+Tab');assert.equal(await defender.evaluate(()=>document.activeElement?.tagName),'SUMMARY');await defender.keyboard.press('Tab');assert((await defender.evaluate(()=>document.activeElement?.textContent))?.includes('Back to missions'));
  const outcomes=[];
  for(const patch of [{label:'Keep broad access',id:'open',attackerDenied:false,maintenanceAllowed:true},{label:'Disable the shared key',id:'shutdown',attackerDenied:true,maintenanceAllowed:false},{label:'Limit access to the job',id:'least-privilege',attackerDenied:true,maintenanceAllowed:true}]){
    console.log('Applying defender policy: '+patch.id);await defender.getByRole('button',{name:new RegExp(patch.label)}).click();await defender.waitForFunction(async id=>{const s=await(await fetch('/api/state')).json();return s.defender?.patch===id&&s.defender?.status==='result';},patch.id,{timeout:10000});
    await defender.waitForTimeout(1500);const data=(await serverState(defender)).defender;
    assert.equal(data.attackerDenied,patch.attackerDenied);assert.equal(data.maintenanceAllowed,patch.maintenanceAllowed);assert.equal(data.success,patch.id==='least-privilege');assert.equal(data.decisions.length,2);
    assert.equal(await defender.getByRole('button',{name:'Complete the campaign',exact:false}).isEnabled(),patch.id==='least-privilege');
    assert.equal(await defender.locator('.intruder-request').getAttribute('class'),`defender-request intruder-request is-${patch.attackerDenied?'denied':'allowed'}`);
    assert.equal(await defender.locator('.maintenance-request').getAttribute('class'),`defender-request maintenance-request is-${patch.maintenanceAllowed?'allowed':'denied'}`);
    outcomes.push(data);results[`defender-${patch.id}-1280`]=await screenshot(defender,`08-defender-${patch.id}-1280`);
  }
  await defender.setViewportSize({width:1920,height:1080});results.defenderSuccessLayout1920=await screenshot(defender,'09-defender-verified-1920');
  await defender.getByText('Inspect the access decisions',{exact:true}).click();await defender.locator('.defender-evidence li').nth(1).waitFor();assert.equal(await defender.locator('.defender-evidence li').count(),2);results.defenderEvidenceLayout1920=await screenshot(defender,'10-defender-decisions-1920');
  await defender.getByRole('button',{name:'Complete the campaign',exact:false}).click();await defender.getByRole('heading',{name:/Access restored/}).waitFor();
  results.defender={menuSetup:'Public defender-start command in isolated session, not earned mission wins',patches:outcomes,keyboardFocusWrapped:true,actualDecisionLog:true,creditsAfterVerifiedSuccess:true};await defenderContext.close();
  }
  assert.deepEqual(errors,[]);results.errors=errors;results.requests=await Promise.all(requests);await fs.writeFile(`${output}/learning-verification-${phase}.json`,JSON.stringify(results,null,2)+'\n');console.log(JSON.stringify(results,null,2));
} catch(error){results.failure=String(error);results.errors=errors;results.requests=await Promise.all(requests);await fs.writeFile(`${output}/learning-verification-${phase}.json`,JSON.stringify(results,null,2)+'\n');throw error;} finally {await browser.close();}
