import {useEffect, useRef, useState, type PointerEvent} from 'react';
import type {Direction} from '../shared/types';

export const canVibrate=()=>typeof navigator!=='undefined'&&typeof navigator.vibrate==='function';

function pulse(enabled:boolean){
  if(!enabled||!canVibrate())return;
  try{navigator.vibrate(8);}catch{/* Hardware feedback must never interrupt steering. */}
}

export default function DirectionPad({disabled,touchLayout,direction,haptics,onSteer}:{
  disabled:boolean;touchLayout:boolean;direction:Direction|null;haptics:boolean;onSteer:(direction:Direction)=>void;
}){
  const owner=useRef<number|null>(null),last=useRef<Direction|null>(null);
  const [pressed,setPressed]=useState<Direction|null>(null);
  useEffect(()=>{if(disabled){owner.current=null;last.current=null;setPressed(null);}},[disabled]);
  const steer=(next:Direction,pointerType:string)=>{
    last.current=next;setPressed(next);onSteer(next);
    if(pointerType==='touch'||pointerType==='pen')pulse(haptics);
  };
  const directionAt=(target:Element|null,pad:HTMLElement)=>{
    const button=target?.closest<HTMLButtonElement>('button[data-direction]');
    return button&&pad.contains(button)&&!button.disabled?button.dataset.direction as Direction:null;
  };
  const down=(event:PointerEvent<HTMLDivElement>)=>{
    if(!touchLayout||disabled||event.button!==0)return;
    const next=directionAt(event.target as Element,event.currentTarget);if(!next)return;
    // The most recent finger owns steering; releasing an older one never replays it.
    owner.current=event.pointerId;event.currentTarget.setPointerCapture(event.pointerId);
    event.preventDefault();steer(next,event.pointerType);
  };
  const move=(event:PointerEvent<HTMLDivElement>)=>{
    if(disabled||owner.current!==event.pointerId)return;
    const next=directionAt(document.elementFromPoint(event.clientX,event.clientY),event.currentTarget);
    // Crossing the gaps keeps the chosen heading without issuing repeated inputs.
    if(next&&next!==last.current)steer(next,event.pointerType);
  };
  const end=(event:PointerEvent<HTMLDivElement>)=>{
    if(owner.current!==event.pointerId)return;
    owner.current=null;last.current=null;setPressed(null);
  };
  return <div className="direction-pad" onPointerDown={down} onPointerMove={move} onPointerUp={end} onPointerCancel={end} onLostPointerCapture={end}>
    {(['north','west','south','east'] as Direction[]).map((next,index)=><button
      key={next} className={`key-button ${next}`} data-direction={next} data-touch-pressed={pressed===next}
      aria-label={`Move ${next}`} disabled={disabled} aria-pressed={direction===next}
      onClick={event=>{
        // Pointer input was already sent on contact. Keep keyboard and assistive clicks.
        if(!touchLayout||event.detail===0)onSteer(next);
      }}>
      <span className="desktop-key">{['W','A','S','D'][index]}</span>
      <span className="touch-only direction-arrow" aria-hidden="true">{['↑','←','↓','→'][index]}</span>
    </button>)}
  </div>;
}
