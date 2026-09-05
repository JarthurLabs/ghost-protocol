import { useEffect, useRef, useState } from 'react';
import type { DefenderPatch, DefenderState } from '../shared/types';
import { CYBERSECURITY_SOURCES } from '../shared/learning';
import './learning.css';

export interface DefenderLabProps {
  state: DefenderState | null;
  busy: boolean;
  reducedMotion: boolean;
  onPatch: (patch: DefenderPatch) => void;
  onBack: () => void;
  onComplete: () => void;
}
const patches: {id:DefenderPatch;title:string;summary:string;code:string}[] = [
  {id:'open',title:'Keep broad access',summary:'Let the shared Maintenance key open both vault data and the service bay.',code:'01'},
  {id:'shutdown',title:'Disable the shared key',summary:'Switch off the Maintenance key for both holders. It will open neither resource.',code:'02'},
  {id:'least-privilege',title:'Limit access to the job',summary:'Let the shared Maintenance key open only the service bay. Remove vault access.',code:'03'},
];

function RequestPath({intruder,allowed,busy}:{intruder:boolean;allowed:boolean|null;busy:boolean}) {
  const outcome=allowed===null?'pending':allowed?'allowed':'denied';
  return <div className={`defender-request ${intruder?'intruder-request':'maintenance-request'} is-${outcome}`}>
    <div className="request-actor"><div className={`request-drone${intruder?' hostile':''}`} aria-hidden="true"><i /><b /></div><strong>{intruder?'INTRUDER':'MAINTENANCE'}</strong><small>{intruder?'Copied Maintenance key':'Legitimate worker'}</small></div>
    <div className={`request-route${busy?' checking':''}`} aria-hidden="true"><span className="request-line" /><span className="request-packet" /><span className="request-gate"><i /><i /><b>{allowed===null?'?':allowed?'✓':'×'}</b></span></div>
    <div className="request-resource"><div className={`resource-symbol${intruder?' archive-symbol':''}`} aria-hidden="true">{intruder?<><i /><i /><i /></>:<span>↻</span>}</div><strong>{intruder?'VAULT DATA':'SERVICE BAY'}</strong><small>{busy?'Checking access…':allowed===null?'Waiting for a policy':allowed?'Access allowed':'Access denied'}</small></div>
  </div>;
}

export default function DefenderLab({state,busy,reducedMotion,onPatch,onBack,onComplete}:DefenderLabProps) {
  const heading=useRef<HTMLHeadingElement>(null);
  const [evidenceOpen,setEvidenceOpen]=useState(false);
  useEffect(()=>{heading.current?.focus();},[]);
  const hasResult=state?.status==='result';
  const attackerAllowed=hasResult&&state.attackerDenied!==null?!state.attackerDenied:null;
  const maintenanceAllowed=hasResult?state.maintenanceAllowed:null;
  const success=hasResult&&state.success&&state.attackerDenied===true&&state.maintenanceAllowed===true;
  const headline=busy?'Checking both access requests…':!hasResult?'Two requests. One access rule.':success?'Contained. Maintenance stays online.':state.attackerDenied===false?'The copied key still reaches the vault.':state.maintenanceAllowed===false?'The intruder is blocked. So is legitimate work.':'The result is incomplete. Try the rule again.';
  const explanation=!hasResult?'Choose an access rule. Then compare the intruder’s attempt to read vault data with the worker’s attempt to service the bay.':success?'The key now allows only the maintenance job. The vault request is denied, and the service request succeeds. Giving only the access a job needs is called least privilege.':state.attackerDenied===false?'The maintenance job does not need vault data. That extra permission lets the copied key open it too. Change the rule, then check both requests again.':state.maintenanceAllowed===false?'Switching the whole key off blocks the intruder, but the worker loses access too. Try keeping only the permission needed for maintenance.':'Check both results: the intruder must be denied and the legitimate worker must still be allowed.';
  return <div className={`learning-overlay${reducedMotion?' learning-reduced':''}`}>
    <div className="learning-panel defender-panel" aria-labelledby="defender-heading">
      <div className="learning-topline"><span className="eyebrow"><i className="mint-line" />FINAL ASSIGNMENT · DEFENDER LAB</span><button className="learning-text-button" onClick={onBack}>Back to missions <span aria-hidden="true">↗</span></button></div>
      <div className="defender-header"><div><span className="mission-brief-index">YOUR TURN TO SET THE RULES</span><h1 id="defender-heading" ref={heading} tabIndex={-1}>Protect the vault.<br /><em>Keep the work moving.</em></h1></div><span className="lab-mode-badge"><i />AUTHORIZED TRAINING NETWORK</span></div>
      <p className="defender-intro">A worker’s Maintenance key was copied. It opens the service bay and vault data, but the worker only needs the service bay. Set an access rule for this shared key, then test both requests.</p>
      <div className="defender-workbench">
        <div className="defender-policies" aria-label="Available policy patches">{patches.map(patch=><button key={patch.id} className={`policy-choice${state?.patch===patch.id?' selected':''}`} onClick={()=>onPatch(patch.id)} disabled={busy} aria-pressed={state?.patch===patch.id}><span className="policy-number">{patch.code}</span><span><strong>{patch.title}</strong><small>{patch.summary}</small></span><span className="policy-arrow" aria-hidden="true">→</span></button>)}</div>
        <div className="defender-simulation" key={state?.patch??'ready'}><div className="defender-simulation-header"><span>LIVE ACCESS CHECK</span><small>{busy?'REQUESTS IN PROGRESS':hasResult?'ACTUAL RESULTS':'CHOOSE A RULE'}</small></div><RequestPath intruder allowed={attackerAllowed} busy={busy}/><RequestPath intruder={false} allowed={maintenanceAllowed} busy={busy}/><div className="simulation-footnote">Each path shows the result of an actual access check.</div></div>
      </div>
      <div className={`defender-result${success?' verified':hasResult?' needs-work':''}`} aria-live="polite" aria-atomic="true"><span className="result-symbol" aria-hidden="true">{busy?'…':success?'✓':hasResult?'!':'?'}</span><div><h2>{headline}</h2><p>{explanation}</p></div></div>
      {success&&<p className="defender-limit"><strong>The copy still exists.</strong> You limited what it can open. A real response to a stolen key also needs to disable and replace the exposed key.</p>}
      <div className="defender-bottom"><details className="defender-evidence" onToggle={event=>setEvidenceOpen(event.currentTarget.open)}><summary tabIndex={0}>Inspect the access decisions</summary>{evidenceOpen&&<>{state?.decisions.length?<ol>{state.decisions.map((decision,index)=><li key={`${decision.actor}-${decision.resource}-${index}`}><span className={decision.allow?'decision-allow':'decision-deny'}>{decision.allow?'ALLOW':'DENY'}</span><strong>{decision.actor}</strong><span>{decision.action} · {decision.resource}</span><small>{decision.reason}</small></li>)}</ol>:<p>Apply a patch to produce actual server decisions.</p>}<a href={CYBERSECURITY_SOURCES[0].url} target="_blank" rel="noreferrer">Read the least privilege principle <span aria-hidden="true">↗</span></a></>}</details><button className="primary-button" disabled={!success||busy} onClick={onComplete}>Complete the campaign <span aria-hidden="true">→</span></button></div>
    </div>
  </div>;
}
