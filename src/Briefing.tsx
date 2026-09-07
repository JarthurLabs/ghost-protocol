import { useEffect, useRef, useState } from 'react';
import type { LevelDefinition } from '../shared/campaign-schema';
import { getMissionLearning } from '../shared/learning';
import AccessPractice from './AccessPractice';
import './learning.css';

export interface BriefingProps {
  level: LevelDefinition;
  intro: boolean;
  reducedMotion: boolean;
  firstVisit?: boolean;
  touchLayout?: boolean;
  onBegin: () => void;
  onBack: () => void;
}

const chapters = [
  { label: 'Your assignment', title: 'You have permission to test this network.', text: 'You control PIP-07, a maintenance drone in a fictional training network. Recover the gold data package, then close the access that could let a pursuer follow you.' },
  { label: 'Borrowed access', title: 'A digital key says what you may open.', text: 'A credential is a digital key. Its permissions say what it can open. Collect the amber Vault key and matching gates use it automatically.' },
  { label: 'A copied key', title: 'A copy can open the same doors.', text: 'In this lab, collecting the package simulates a Vault-key leak and starts the chase. Patrols can catch you before that too. Keep your distance throughout the mission.' },
  { label: 'Switch access off', title: 'Close the access the pursuer copied.', text: 'Cross into cyan, then press E at the Vault door switch. Both holders lose Vault permission. Switching access off is called revocation. The sentry remains in the maze; keep moving toward extraction.', touchText: 'Cross into cyan, then tap the action button at the Vault door switch when it says Lock Vault behind you. Both holders lose Vault permission. Switching access off is called revocation. The sentry remains in the maze; keep moving toward extraction.' },
];

function Drone({x,y,security=false}:{x:number;y:number;security?:boolean}) {
  return <g transform={`translate(${x} ${y})`}>
    <ellipse cx="0" cy="26" rx="27" ry="7" fill="#08171f" opacity=".55" />
    <rect x="-27" y="-23" width="54" height="42" rx="13" fill={security?'#425168':'#e9e7d8'} stroke={security?'#73809d':'#faf2d6'} strokeWidth="2" />
    <rect x="-31" y="-9" width="8" height="22" rx="4" fill="#477d8b" />
    <rect x="23" y="-9" width="8" height="22" rx="4" fill="#477d8b" />
    <rect x="-21" y="-7" width="42" height="16" rx="7" fill="#142735" />
    <rect x="-11" y="-2" width="25" height="5" rx="2.5" fill={security?'#ff8e87':'#88ead5'} />
    <path d="M14-23v-11" stroke="#96a7a8" strokeWidth="3" />
    <circle cx="14" cy="-37" r="4" fill={security?'#ff8e87':'#edc16d'} />
    <path d="M-14 23h28" stroke={security?'#ff8e87':'#88ead5'} strokeWidth="3" strokeLinecap="round" />
  </g>;
}
function Key({x,y,copied=false}:{x:number;y:number;copied?:boolean}) {
  return <g transform={`translate(${x} ${y})`} fill="none" stroke={copied?'#f49f8a':'#edc16d'} strokeWidth="5" strokeLinecap="round" strokeLinejoin="round">
    <circle cy="-11" r="11" /><path d="M0 0v26h11m-11-11h8" />
  </g>;
}
function IntroDiagram({chapter,reducedMotion}:{chapter:number;reducedMotion:boolean}) {
  const copied=chapter>=2,revoked=chapter>=3;
  return <div className={`intro-diagram chapter-${chapter}${reducedMotion?' learning-reduced':''}`}>
    <svg viewBox="0 0 760 258" role="img" aria-label={revoked?'A revoked credential is denied at a protected gate. Ordinary maintenance access remains available.':copied?'An authorized tester and a sentry hold copies of the same credential.':chapter===1?'An access key opens a protected gate for the tester.':'The maintenance drone enters a fictional authorized training network.'}>
      <defs>
        <pattern id="brief-grid" width="32" height="32" patternUnits="userSpaceOnUse"><path d="M32 0H0v32" fill="none" stroke="#7198a1" strokeOpacity=".08" /></pattern>
        <linearGradient id="brief-vault" x1="0" y1="0" x2="1" y2="1"><stop stopColor="#444b72" /><stop offset="1" stopColor="#293950" /></linearGradient>
      </defs>
      <rect x="1" y="1" width="758" height="256" rx="17" fill="#142530" stroke="#809ba4" strokeOpacity=".2" />
      <rect x="2" y="2" width="756" height="254" rx="17" fill="url(#brief-grid)" />
      <path d="M104 92H657M104 92v117h255M388 173h110V92" fill="none" stroke="#466570" strokeWidth="5" strokeLinecap="round" strokeLinejoin="round" />
      <path className="intro-access-trace" d="M104 92H657" fill="none" stroke={revoked?'#f49f8a':'#edc16d'} strokeWidth="2" strokeDasharray="6 9" opacity={chapter>=1?.75:.2} />
      <path d="M104 144v65h255" fill="none" stroke="#88ead5" strokeWidth="2" strokeDasharray="5 7" opacity=".6" />
      <g className="intro-tester"><Drone x={105} y={84} /></g>
      <text x="105" y="145" className="diagram-label" textAnchor="middle">AUTHORIZED TESTER</text>
      <g opacity={chapter>=1?1:.15} className="intro-key"><Key x={285} y={84} /></g>
      <text x="285" y="143" className="diagram-label" textAnchor="middle">{revoked?'VAULT REVOKED':'AMBER VAULT KEY'}</text>
      <g opacity={copied?1:.1} className="intro-sentry"><Drone x={391} y={183} security /><Key x={449} y={176} copied /></g>
      <text x="409" y="242" className="diagram-label danger" textAnchor="middle">COPIED CREDENTIAL</text>
      <g transform="translate(550 89)">
        <rect x="-24" y="-34" width="48" height="70" rx="8" fill="#172631" stroke={revoked?'#f49f8a':'#8be6d4'} strokeWidth="2" />
        <path d="M-15-23V25M15-23V25" stroke={revoked?'#f49f8a':'#8be6d4'} strokeWidth="3" />
        <rect className="intro-gate-panel" x="-12" y="-22" width="24" height="44" rx="2" fill={revoked?'#f49f8a':'#8be6d4'} opacity={revoked?.45:chapter>=1?.06:.35} />
        {revoked&&<path d="m-6-6 12 12M6-6-6 6" stroke="#ffd0bc" strokeWidth="3" strokeLinecap="round" />}
      </g>
      <text x="550" y="143" className={`diagram-label${revoked?' danger':''}`} textAnchor="middle">{revoked?'ACCESS DENIED':'VAULT GATE'}</text>
      <g transform="translate(667 90)"><path d="m-31-20 31-15 31 15v40l-31 15-31-15Z" fill="url(#brief-vault)" stroke="#b3a9de" /><path d="M-31-20 0-4l31-16M0-4v39" fill="none" stroke="#b3a9de" /><rect x="-7" y="-16" width="14" height="14" rx="3" fill="#edc16d" transform="rotate(-30)" /></g>
      <text x="667" y="151" className="diagram-label" textAnchor="middle">VAULT DATA</text>
      <circle cx="267" cy="209" r="9" fill="#214b4f" stroke="#88ead5" /><path d="m263 209 3 3 6-7" stroke="#88ead5" strokeWidth="2" fill="none" />
      <text x="288" y="213" className="diagram-label mint">MAINTENANCE</text>
      {revoked&&<g className="intro-denial-pulse"><circle cx="549" cy="89" r="43" fill="none" stroke="#f49f8a" strokeOpacity=".25" /></g>}
    </svg>
  </div>;
}

export default function Briefing({level,intro,reducedMotion,firstVisit=false,touchLayout=false,onBegin,onBack}:BriefingProps) {
  const [storyOpen,setStoryOpen]=useState(intro),[chapter,setChapter]=useState(0);
  const practiceMode=level.id===1?'borrowed':level.id===3?'expiry':level.id===4?'scopes':null;
  const [practiceOpen,setPracticeOpen]=useState(firstVisit&&practiceMode!==null);
  const heading=useRef<HTMLHeadingElement>(null);
  const learning=getMissionLearning(level.id);
  const hasTransit=level.grants.some(grant=>grant.id==='transit');
  const hasClockReader=level.objects.some(object=>object.type==='renewal');
  useEffect(()=>{setStoryOpen(intro);setChapter(0);setPracticeOpen(firstVisit&&practiceMode!==null);},[intro,level.id,firstVisit,practiceMode]);
  useEffect(()=>{heading.current?.focus();},[storyOpen]);
  useEffect(()=>{
    if(touchLayout)heading.current?.closest('.learning-panel')?.scrollTo({top:0});
  },[chapter,touchLayout]);
  return <div className={`learning-overlay${reducedMotion?' learning-reduced':''}`}>
    <div className={`learning-panel briefing-panel${storyOpen?' showing-intro':''}`} aria-labelledby="briefing-heading">
      <div className="learning-topline"><span className="eyebrow"><i className="mint-line" />AUREL TRAINING NETWORK</span><button className="learning-text-button" onClick={storyOpen?()=>setStoryOpen(false):onBack}>{storyOpen?'Skip introduction':'Back to missions'}<span aria-hidden="true">↗</span></button></div>
      {storyOpen?<>
        <div className="intro-chapter-label">{String(chapter+1).padStart(2,'0')} / {chapters[chapter].label.toUpperCase()} <span>AT YOUR PACE</span></div>
        <h1 id="briefing-heading" ref={heading} tabIndex={-1}>{chapters[chapter].title}</h1>
        <IntroDiagram chapter={chapter} reducedMotion={reducedMotion} />
        <p className="intro-caption" aria-live="polite" aria-atomic="true">{touchLayout?(chapters[chapter].touchText??chapters[chapter].text):chapters[chapter].text}</p>
        <nav className="intro-chapters" aria-label="Introduction chapters">{chapters.map((item,index)=><button key={item.label} className={index<=chapter?'complete':''} aria-current={index===chapter?'step':undefined} aria-label={`Chapter ${index+1}: ${item.label}`} onClick={()=>setChapter(index)}><i aria-hidden="true" />{item.label}</button>)}</nav>
        <div className="intro-footer"><button className="learning-text-button" disabled={chapter===0} onClick={()=>setChapter(value=>Math.max(0,value-1))}><span aria-hidden="true">←</span>Previous chapter</button><div className="intro-forward"><button className="learning-text-button" onClick={()=>setStoryOpen(false)}>Mission briefing <span aria-hidden="true">→</span></button><button className="primary-button" onClick={()=>chapter===chapters.length-1?setStoryOpen(false):setChapter(value=>value+1)}>{chapter===chapters.length-1?'Open mission briefing':'Next chapter'} <span aria-hidden="true">→</span></button></div></div>
      </>:<>
        <div className="brief-scroll">
          <div className="mission-brief-index">MISSION {String(level.id).padStart(2,'0')} <span>THE GHOST PROTOCOL CAMPAIGN</span></div>
          <h1 id="briefing-heading" ref={heading} tabIndex={-1}>{level.title}</h1>
          <p className="brief-subtitle">{level.subtitle}</p>
          <div className="brief-mission-body"><div><span className="learning-small-label">YOUR ASSIGNMENT</span><p>{level.briefing}</p></div><div className="brief-concept"><span className="learning-small-label">THE SECURITY IDEA</span><strong>{learning.plainTitle}</strong><p>{learning.definition}</p></div></div>
          {hasTransit&&<div className="brief-key-legend" aria-label="Two automatic keys">{[{label:'AMBER VAULT KEY',detail:'Opens the archive.',color:'#edc16d'},{label:'CYAN TRANSIT KEY',detail:'Opens the final exit.',color:'#8de6d4'}].map(key=><div key={key.label}><svg width="17" height="30" viewBox="0 0 17 30" fill="none" stroke={key.color} strokeWidth="2.5" strokeLinecap="round" aria-hidden="true"><circle cx="7" cy="7" r="5"/><path d="M7 12v15h7M7 21h5"/></svg><div><strong style={{color:key.color}}>{key.label}</strong><span>{key.detail} Used automatically.</span></div></div>)}</div>}
          {hasClockReader&&<p className="brief-reader-note"><span aria-hidden="true">◷ </span>Pass over a raised clock reader to refresh the key named on the device.</p>}
          {practiceMode&&<section className="brief-practice" aria-label="Optional access practice"><button className="practice-toggle" aria-expanded={practiceOpen} aria-controls="brief-access-practice" onClick={()=>setPracticeOpen(value=>!value)}><span><strong>Try the access check</strong><small>Optional practice. Safe to explore before the chase.</small></span><b aria-hidden="true">{practiceOpen?'−':'+'}</b></button>{practiceOpen&&<div id="brief-access-practice"><AccessPractice mode={practiceMode} /></div>}</section>}
          <details className="brief-route-tip"><summary>Route tip</summary><p>{level.tip}</p></details>
          <div className="brief-controls" aria-label="Mission controls">{touchLayout?<>
            <span><span className="brief-touch-label">Directions</span><b>Steer</b><small>Tap an arrow. The drone keeps moving.</small></span>
            <span><span className="brief-touch-label">Brake</span><b>Stop the drone</b><small>Sentries keep moving.</small></span>
            <span><span className="brief-touch-label">Action</span><b>Vault lockdown</b><small>{hasTransit?'Lock Vault at the door. Transit stays active.':'Tap the named action at the Vault door.'}</small></span>
            <span><span className="brief-touch-label">Pause</span><b>Take a break</b><small>Stops the whole simulation.</small></span>
          </>:<><span><kbd>W A S D</kbd><b>Steer</b><small>Arrows work too. Keep moving.</small></span><span><kbd>SPACE</kbd><b>Brake</b><small>Sentries keep moving.</small></span><span><kbd>E</kbd><b>Vault lockdown</b><small>{hasTransit?'Transit stays active.':'Shuts Vault gates.'}</small></span><span><kbd>ESC</kbd><b>Pause</b><small>Stops the whole simulation.</small></span></>}</div>
        </div>
        <div className="brief-bottom"><p><span className="training-dot" />Start whenever you are ready. Practice and questions are optional.</p><button className="primary-button" onClick={onBegin}>Begin mission <span aria-hidden="true">→</span></button></div>
      </>}
    </div>
  </div>;
}
