import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { getLevel, type Zone } from '../shared/level';
import type { GameState } from '../shared/types';

const C = { ivory:0xe9dfc8, charcoal:0x29354b, dark:0x142131, cyan:0x53efdd, gold:0xf0b84e, red:0xff6b67, pale:0xbac3ba, indigo:0x8681d5, teal:0x367f91, amber:0xc88836 };
const mat = (color:number,metalness=0,roughness=.6)=>new THREE.MeshStandardMaterial({color,metalness,roughness});
const glow = (color:number,intensity=1)=>new THREE.MeshStandardMaterial({color,emissive:color,emissiveIntensity:intensity,roughness:.35});
function box(parent:THREE.Object3D,w:number,h:number,d:number,x:number,y:number,z:number,material:THREE.Material,round=.025){
  const o=new THREE.Mesh(round?new RoundedBoxGeometry(w,h,d,2,round):new THREE.BoxGeometry(w,h,d),material);
  o.position.set(x,y,z);o.castShadow=true;o.receiveShadow=true;parent.add(o);return o;
}
function cyl(parent:THREE.Object3D,r:number,h:number,x:number,y:number,z:number,material:THREE.Material,r2=r){
  const o=new THREE.Mesh(new THREE.CylinderGeometry(r,r2,h,32),material);o.position.set(x,y,z);o.castShadow=true;o.receiveShadow=true;parent.add(o);return o;
}
function ring(parent:THREE.Object3D,r:number,t:number,x:number,y:number,z:number,color:number){
  const o=new THREE.Mesh(new THREE.TorusGeometry(r,t,8,48),glow(color,.8));o.rotation.x=-Math.PI/2;o.position.set(x,y,z);parent.add(o);return o;
}
function textSign(parent:THREE.Object3D,text:string,x:number,y:number,z:number,width:number,color='#d6decf',background='transparent'){
  const canvas=document.createElement('canvas');canvas.width=1024;canvas.height=192;
  const ctx=canvas.getContext('2d')!;if(background!=='transparent'){ctx.fillStyle=background;ctx.fillRect(0,0,1024,192);}
  ctx.fillStyle=color;ctx.font='600 78px ui-monospace, SFMono-Regular, monospace';ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText(text,512,96);
  const texture=new THREE.CanvasTexture(canvas);texture.colorSpace=THREE.SRGBColorSpace;
  const mesh=new THREE.Mesh(new THREE.PlaneGeometry(width,width*192/1024),new THREE.MeshBasicMaterial({map:texture,transparent:true,depthWrite:false}));
  mesh.position.set(x,y,z);parent.add(mesh);return mesh;
}
function scopeSign(parent:THREE.Object3D,text:string,x:number,y:number,z:number,width:number,color:string,compact=false){
  const canvas=document.createElement('canvas');canvas.width=compact?192:512;canvas.height=compact?192:128;
  const ctx=canvas.getContext('2d')!;ctx.fillStyle='#10212b';ctx.fillRect(0,0,canvas.width,canvas.height);
  ctx.strokeStyle=color;ctx.lineWidth=compact?10:5;ctx.strokeRect(5,5,canvas.width-10,canvas.height-10);
  ctx.fillStyle=color;ctx.font=`750 ${compact?132:64}px ui-monospace, SFMono-Regular, monospace`;ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText(text,canvas.width/2,canvas.height/2+3);
  const map=new THREE.CanvasTexture(canvas);map.colorSpace=THREE.SRGBColorSpace;
  const mesh=new THREE.Mesh(new THREE.PlaneGeometry(width,width*canvas.height/canvas.width),new THREE.MeshBasicMaterial({map,toneMapped:false}));
  mesh.position.set(x,y,z);parent.add(mesh);return mesh;
}
function deviceScreen(symbol:'clock'|'lock',mark:string,color:string){
  const canvas=document.createElement('canvas');canvas.width=256;canvas.height=256;
  const ctx=canvas.getContext('2d')!;ctx.fillStyle='#10232d';ctx.fillRect(0,0,256,256);
  ctx.strokeStyle=color;ctx.fillStyle=color;ctx.lineWidth=13;ctx.lineCap='round';ctx.lineJoin='round';
  if(symbol==='clock'){
    ctx.beginPath();ctx.arc(128,105,58,0,Math.PI*2);ctx.stroke();
    ctx.beginPath();ctx.moveTo(128,62);ctx.lineTo(128,105);ctx.lineTo(158,123);ctx.stroke();
    ctx.beginPath();ctx.moveTo(112,30);ctx.lineTo(144,30);ctx.moveTo(128,30);ctx.lineTo(128,46);ctx.stroke();
  }else{
    ctx.beginPath();ctx.arc(128,83,38,Math.PI,0);ctx.lineTo(166,101);ctx.moveTo(90,101);ctx.lineTo(90,83);ctx.stroke();
    ctx.strokeRect(76,101,104,73);ctx.beginPath();ctx.moveTo(112,122);ctx.lineTo(144,153);ctx.moveTo(144,122);ctx.lineTo(112,153);ctx.stroke();
  }
  ctx.font='700 46px ui-monospace, SFMono-Regular, monospace';ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText(mark,128,218);
  const map=new THREE.CanvasTexture(canvas);map.colorSpace=THREE.SRGBColorSpace;
  return new THREE.MeshBasicMaterial({map,toneMapped:false});
}
function lockdownScreen(mode:'idle'|'ready'|'locked'){
  const canvas=document.createElement('canvas');canvas.width=384;canvas.height=448;
  const ctx=canvas.getContext('2d')!,color=mode==='ready'?'#ffcb74':mode==='locked'?'#a6f4da':'#9ac3c5';
  ctx.fillStyle='#10212b';ctx.fillRect(0,0,384,448);ctx.strokeStyle=color;ctx.fillStyle=color;
  ctx.lineWidth=9;ctx.strokeRect(9,9,366,430);ctx.textAlign='center';ctx.textBaseline='middle';
  ctx.font='750 50px ui-monospace, SFMono-Regular, monospace';ctx.fillText('V · VAULT',192,66);
  ctx.lineWidth=17;ctx.lineCap='round';ctx.lineJoin='round';
  if(mode==='locked'){
    ctx.beginPath();ctx.moveTo(111,222);ctx.lineTo(169,273);ctx.lineTo(277,157);ctx.stroke();
  }else{
    ctx.beginPath();ctx.arc(192,180,51,Math.PI,0);ctx.lineTo(243,207);ctx.moveTo(141,207);ctx.lineTo(141,180);ctx.stroke();
    ctx.strokeRect(125,208,134,93);ctx.beginPath();ctx.moveTo(174,237);ctx.lineTo(212,274);ctx.moveTo(212,237);ctx.lineTo(174,274);ctx.stroke();
  }
  ctx.font=`750 ${mode==='locked'?49:58}px ui-monospace, SFMono-Regular, monospace`;ctx.fillText(mode==='locked'?'LOCKED':'LOCK',192,371);
  const map=new THREE.CanvasTexture(canvas);map.colorSpace=THREE.SRGBColorSpace;
  return new THREE.MeshBasicMaterial({map,toneMapped:false});
}
function droneModel(security=false,behavior: 'hunter'|'ambusher'|'warden'='hunter'){
  const signal=behavior==='ambusher'?0xe799f2:behavior==='warden'?0xffb45d:C.red;
  const g=new THREE.Group();const body=mat(security?0x36434b:0xf1ede0,.25,.34), dark=mat(0x102128,.45,.24), accent=glow(security?signal:C.cyan,1.3);
  cyl(g,.26,.14,0,.33,0,dark);ring(g,.19,.035,0,.255,0,security?signal:C.cyan);
  box(g,.67,.49,.55,0,.62,0,body,.17);
  box(g,.57,.24,.12,0,.64,.266,dark,.08);
  box(g,.31,.08,.025,security?0:.055,.66,.339,accent,.035);
  if(!security)box(g,.07,.022,.022,.17,.635,.353,mat(0xf8ffed),.008);
  for(const s of [-1,1]){box(g,.13,.27,.31,s*.4,.53,0,security?body:mat(C.teal,.3,.38),.065);box(g,.06,.07,.12,s*.46,.51,.08,accent,.02);}
  cyl(g,.026,.22,.18,.99,-.06,mat(0x657f80));
  const tip=new THREE.Mesh(new THREE.SphereGeometry(.06,12,12),glow(security?signal:C.gold));tip.position.set(.18,1.11,-.06);g.add(tip);
  box(g,.28,.035,.24,0,.886,0,mat(security?signal:C.gold,.5),.017);
  if(security&&behavior==='ambusher'){for(const side of [-1,1])box(g,.09,.36,.36,side*.43,.82,-.08,mat(0x8774bd,.35),.035);}
  if(security&&behavior==='warden'){box(g,.8,.16,.61,0,.41,0,mat(0x936a4b,.4),.055);ring(g,.36,.025,0,.9,0,signal);}
  const shadow=new THREE.Mesh(new THREE.CircleGeometry(.37,32),new THREE.MeshBasicMaterial({color:0x101c22,transparent:true,opacity:.16,depthWrite:false}));shadow.rotation.x=-Math.PI/2;shadow.position.y=.08;g.add(shadow);
  return g;
}
export default function Scene({state,reducedMotion,overview=true,onReady}:{state:GameState;reducedMotion:boolean;overview?:boolean;onReady?:(fps:number)=>void}){
  const host=useRef<HTMLDivElement>(null),stateRef=useRef(state),motionRef=useRef(reducedMotion),overviewRef=useRef(overview),readyRef=useRef(onReady);
  stateRef.current=state;motionRef.current=reducedMotion;overviewRef.current=overview;readyRef.current=onReady;
  useEffect(()=>{
    const level=getLevel(state.levelId),cx=(level.width-1)/2,cz=(level.depth-1)/2;
    const el=host.current!;let renderer:THREE.WebGLRenderer;
    try{renderer=new THREE.WebGLRenderer({antialias:true,alpha:true,powerPreference:'high-performance'});}catch{el.textContent='WebGL could not start. Please open this preview in Chrome or Safari with graphics acceleration enabled.';return;}
    renderer.setPixelRatio(Math.min(devicePixelRatio,1.5));renderer.shadowMap.enabled=true;renderer.shadowMap.type=THREE.PCFShadowMap;renderer.setClearColor(0x101a20,0);renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1.2;el.appendChild(renderer.domElement);
    renderer.domElement.setAttribute('aria-label','The Ghost Protocol arcade maze. Ivory service corridors, an indigo archive and cyan extraction loops surround low machinery islands.');
    const scene=new THREE.Scene(),camera=new THREE.OrthographicCamera();
    camera.position.set(cx+22,34,cz+28);camera.lookAt(cx,0,cz);
    scene.add(new THREE.HemisphereLight(0xdceee7,0x303942,2.5));
    const key=new THREE.DirectionalLight(0xfff0cf,4.3);key.position.set(cx-9,30,cz+5);key.castShadow=true;key.shadow.mapSize.set(2048,2048);Object.assign(key.shadow.camera,{left:-23,right:23,top:23,bottom:-23,near:1,far:80});key.shadow.bias=-.00025;key.shadow.normalBias=.035;scene.add(key);key.target.position.set(cx,0,cz);scene.add(key.target);
    const fill=new THREE.DirectionalLight(0x82d9eb,1.6);fill.position.set(18,10,-8);scene.add(fill);
    const model=new THREE.Group();scene.add(model);
    // Screen-facing labels retain readable text at either camera scale. Only
    // available keys and nearby devices are named, leaving the wider maze clear.
    const labelLayer=document.createElement('div');labelLayer.setAttribute('aria-hidden','true');
    Object.assign(labelLayer.style,{position:'absolute',inset:'0',pointerEvents:'none',overflow:'hidden'});el.appendChild(labelLayer);
    const labels:{element:HTMLDivElement;anchor:THREE.Vector3;id:string;kind:'key'|'reader'|'console'|'gate';grantId?:string;text:string;x:number;z:number}[]=[];
    function deviceLabel(id:string,kind:'key'|'reader'|'console'|'gate',x:number,z:number,text:string,color:string,grantId?:string){
      const element=document.createElement('div');element.dataset.deviceLabel=id;element.textContent=text;
      Object.assign(element.style,{position:'absolute',display:'none',padding:'5px 8px',borderRadius:'4px',border:`1px solid ${color}99`,background:'#10212bf2',color,font:'650 11px ui-monospace, SFMono-Regular, monospace',letterSpacing:'.04em',whiteSpace:'nowrap',boxShadow:'0 2px 8px #0008',transform:'translate(-50%,-100%)'});
      const label={element,anchor:new THREE.Vector3(x,kind==='console'?2.15:1.7,z),id,kind,grantId,text,x,z};
      labelLayer.appendChild(element);labels.push(label);return label;
    }

    const ivory=mat(C.ivory,.06,.75),floorDark=mat(0x344459,.15,.62),escape=mat(0x60b4bb,.2,.5),edge=mat(0x1c2a3b,.4,.52),gold=mat(C.gold,.55,.3);
    const tileMap=new Map(level.tiles.map(tile=>[`${tile.x},${tile.z}`,tile]));
    const zoneCache=new Map<string,Zone>();
    const zoneAt=(x:number,z:number):Zone=>{
      const k=`${x},${z}`,cached=zoneCache.get(k);if(cached)return cached;
      const exact=tileMap.get(k);if(exact)return exact.zone;
      let best=Infinity,zone:Zone='service';
      for(const tile of level.tiles){const d=Math.abs(tile.x-x)+Math.abs(tile.z-z);if(d<best){best=d;zone=tile.zone;}}
      zoneCache.set(k,zone);return zone;
    };
    const wallBody={service:mat(0x527282,.25,.54),vault:mat(0x373e62,.3,.54),escape:mat(0x347079,.25,.54)};
    const wallCap={service:mat(0x94afad,.2,.6),vault:mat(0x656a97,.3,.55),escape:mat(0x7ebfc0,.2,.55)};
    const trim={service:mat(C.amber,.4,.35),vault:mat(C.indigo,.35,.4),escape:glow(C.cyan,.3)};
    const dark=mat(0x192b35,.45,.4),vent=mat(0x284454,.25,.65);
    // A shallow, chamfered plinth gives the maze the same crafted-diorama feel.
    box(model,level.width+.2,.47,level.depth+.2,cx,-.31,cz,edge,.18);
    for(const zone of ['service','vault','escape'] as const){const sector=level.tiles.filter(t=>t.zone===zone),minX=Math.min(...sector.map(t=>t.x)),maxX=Math.max(...sector.map(t=>t.x));box(model,maxX-minX+1,.075,.055,(minX+maxX)/2,-.31,level.depth-.375,trim[zone],.016);}
    // Machined corridor tiles make paths legible at the normal gameplay scale.
    for(const tile of level.tiles){
      box(model,.958,.12,.958,tile.x,-.04,tile.z,tile.zone==='service'?ivory:tile.zone==='vault'?floorDark:escape,.035);
      if((tile.x+tile.z)%4===0)for(const dx of [-.38,.38])box(model,.021,.007,.021,tile.x+dx,.024,tile.z+.38,tile.zone==='vault'?trim.vault:vent,.003);
    }
    // Merge adjacent solid cells into low storage islands instead of a forest of
    // tall blocks. The collision map and the visible maze use the same walls.
    const remaining=new Set(level.walls.map(p=>`${p.x},${p.z}`));
    const islands:{x:number;z:number;w:number;d:number}[]=[];
    for(let z=0;z<level.depth;z++)for(let x=0;x<level.width;x++){
      if(!remaining.has(`${x},${z}`))continue;
      const zone=zoneAt(x,z);let w=1,d=1;
      while(x+w<level.width&&zoneAt(x+w,z)===zone&&remaining.has(`${x+w},${z}`))w++;
      while(z+d<level.depth&&Array.from({length:w},(_,i)=>remaining.has(`${x+i},${z+d}`)&&zoneAt(x+i,z+d)===zone).every(Boolean))d++;
      for(let dx=0;dx<w;dx++)for(let dz=0;dz<d;dz++)remaining.delete(`${x+dx},${z+dz}`);
      const cx=x+(w-1)/2,cz=z+(d-1)/2;
      const boundary=x===0||x+w===level.width||z===0||z+d===level.depth;
      const height=boundary?.3:.47;
      box(model,w-.1,height,d-.1,cx,height/2+.014,cz,wallBody[zone],.075);
      box(model,w-.18,.06,d-.18,cx,height+.022,cz,wallCap[zone],.035);
      // Narrow strips colour the islands without obscuring the corridor chips.
      if(w>=2)box(model,w-.45,.023,.035,cx,height+.057,cz+(d-.28)/2,trim[zone],.008);
      else if(d>=2)box(model,.035,.023,d-.45,cx+(w-.28)/2,height+.057,cz,trim[zone],.008);
      if(!boundary&&w*d>=2)islands.push({x:cx,z:cz,w,d});
    }
    // A few inset vents and archive cartridges give the maze a working-facility
    // identity. They sit on solid islands, never on a playable corridor.
    for(let i=0;i<islands.length;i++){
      const island=islands[i],zone=zoneAt(island.x,island.z);
      if(i%2===1)continue;
      const alongX=island.w>island.d;
      const n=Math.min(6,Math.floor(Math.max(island.w,island.d)*2));
      for(let k=0;k<n;k++){
        const offset=(k-(n-1)/2)*.18;
        box(model,alongX?.045:.45,.018,alongX?.45:.045,island.x+(alongX?offset:0),.55,island.z+(alongX?0:offset),vent,.005);
      }
      if(zone==='vault')box(model,.07,.025,.14,island.x-.21,.557,island.z-.2,glow(C.indigo,.8),.012);
    }
    // Low authored-kit landmarks distinguish the five facilities without
    // hiding a corridor: pressure drums, timed cores and split server banks.
    const landmarks=islands.filter(i=>i.w>=2&&i.d>=2).sort((a,b)=>b.w*b.d-a.w*a.d).slice(0,level.id+1);
    for(let i=0;i<landmarks.length;i++){
      const island=landmarks[i]!,zone=zoneAt(island.x,island.z);
      if(level.id===4||zone==='vault'&&level.id===5){
        for(const side of [-1,1]){
          box(model,.43,.32,.64,island.x+side*.32,.73,island.z,wallBody[zone],.055);
          for(let slot=0;slot<3;slot++)box(model,.3,.018,.04,island.x+side*.32,.9,island.z-.2+slot*.2,vent,.008);
        }
      }else{
        cyl(model,.43,.08,island.x,.61,island.z,dark);
        cyl(model,.32,.29,island.x,.77,island.z,wallCap[zone],.37);
        cyl(model,.34,.05,island.x,.92,island.z,vent);
        box(model,.43,.026,.07,island.x,.96,island.z,wallBody[zone],.01);
        for(const side of [-1,1])cyl(model,.035,.024,island.x+side*.2,.977,island.z,wallCap[zone]);
      }
    }
    // Rim names derive from authored sectors. No invisible x-boundaries or
    // hard-coded zone walls can disagree with the collision graph.
    for(const zone of ['service','vault','escape'] as const){
      const sector=level.tiles.filter(t=>t.zone===zone),minX=Math.min(...sector.map(t=>t.x)),maxX=Math.max(...sector.map(t=>t.x));
      const title=zone==='service'?'SERVICE':zone==='vault'?'ARCHIVE':'EGRESS';
      const sign=textSign(model,title,(minX+maxX)/2,.38,0,Math.min(maxX-minX+.5,5.7),zone==='vault'?'#dad2f5':zone==='service'?'#d7dfca':'#b5f7eb');sign.rotation.x=-Math.PI/2;
    }
    for(const x of [0,level.width-1])for(const z of [0,level.depth-1]){
      box(model,.14,.46,.14,x,.55,z,edge,.026);box(model,.09,.17,.09,x,.78,z,glow(C.cyan,.65),.02);
    }
    // Low reader stands mount at a solid corridor edge. The device tile and
    // its centre remain visually open and retain the same passable floor graph.
    function readerStand(data:typeof level.objects[number],symbol:'clock'|'lock',mark:string,color:string){
      const offsets=[{x:0,z:-1},{x:-1,z:0},{x:1,z:0},{x:0,z:1}];
      const side=offsets.find(d=>!tileMap.has(`${data.x+d.x},${data.z+d.z}`))??{x:-.7,z:-.7};
      const group=new THREE.Group();group.position.set(data.x+side.x*.7,0,data.z+side.z*.7);group.rotation.y=Math.atan2(22,28);model.add(group);
      box(group,.25,.055,.22,0,.052,0,dark,.025);box(group,.085,.41,.085,0,.28,0,mat(C.pale,.35),.015);
      const head=new THREE.Group();head.position.y=.65;head.rotation.x=-.35;group.add(head);
      box(head,.51,.41,.14,0,0,0,mat(symbol==='lock'?0x397c86:0x657880,.3),.055);
      const screen=new THREE.Mesh(new THREE.PlaneGeometry(.435,.33),deviceScreen(symbol,mark,color));screen.position.z=.081;head.add(screen);
      const light=box(head,.38,.025,.025,0,-.23,.035,glow(new THREE.Color(color).getHex(),.8),.008);
      return {group,light};
    }
    const accessKeys:{data:typeof level.objects[number];group:THREE.Group;badge:THREE.Mesh}[]=[];
    const renewals:{data:typeof level.objects[number];light:THREE.Mesh;group:THREE.Group}[]=[];
    for(const data of level.objects.filter(o=>o.type==='terminal'||o.type==='renewal')){
      const definition=level.grants.find(g=>g.id===data.grantId)!,letter=definition.id==='transit'?'T':'V';
      const color=new THREE.Color(definition.color).getHex(),material=mat(color,.55,.3);
      if(data.type==='terminal'){
        const group=new THREE.Group();group.position.set(data.x,.59,data.z);model.add(group);
        const bow=new THREE.Mesh(new THREE.TorusGeometry(.15,.055,8,24),material);bow.position.y=.15;group.add(bow);
        box(group,.105,.35,.09,0,-.1,0,material,.025);box(group,.17,.085,.1,.075,-.23,0,material,.018);box(group,.12,.07,.1,.053,-.1,0,material,.015);
        ring(model,.32,.018,data.x,.033,data.z,color);
        const badge=scopeSign(model,letter,data.x+.24,.94,data.z,.3,definition.color,true);badge.quaternion.copy(camera.quaternion);
        accessKeys.push({data,group,badge});deviceLabel(data.id,'key',data.x,data.z,`${letter} · ${definition.label.toUpperCase()} KEY`,definition.color,data.grantId);
      }else{
        const reader=readerStand(data,'clock',letter,definition.color);renewals.push({data,...reader});
        deviceLabel(data.id,'reader',data.x,data.z,`${letter} · RENEW ${definition.label.toUpperCase()}`,definition.color,data.grantId);
      }
    }
    // The package is another passable pickup, with its familiar gold cage.
    const packageData=level.objects.find(o=>o.type==='package')!;
    const packageGroup=new THREE.Group();packageGroup.position.set(packageData.x,.7,packageData.z);model.add(packageGroup);
    box(packageGroup,.42,.42,.42,0,0,0,gold,.055);
    box(packageGroup,.44,.055,.44,0,0,0,glow(C.gold,.35),.012);
    box(packageGroup,.07,.44,.44,0,0,0,mat(0xffdc8c,.6),.015);
    const cage=new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(.72,.83,.72)),new THREE.LineBasicMaterial({color:C.gold,transparent:true,opacity:.3}));cage.position.set(packageData.x,.68,packageData.z);model.add(cage);
    ring(model,.35,.023,packageData.x,.034,packageData.z,C.gold);
    const packageBeacon=ring(model,.45,.012,packageData.x,.034,packageData.z,C.gold);
    // Put the switch at the opposite cyan-side corner, clear of the Vault
    // plaque. Derive the same placement from every mission's exit doorway.
    // The action still belongs to the authored first escape tile.
    const consoleData=level.objects.find(o=>o.type==='console')!;
    const consoleGate=level.gates.find(g=>g.grantId===level.compromisedGrantId&&[g.a,g.b].some(p=>p.x===consoleData.x&&p.z===consoleData.z))!;
    const near=consoleGate.a.x===consoleData.x&&consoleGate.a.z===consoleData.z?consoleGate.a:consoleGate.b;
    const far=near===consoleGate.a?consoleGate.b:consoleGate.a;
    const out={x:near.x-far.x,z:near.z-far.z},along={x:-out.z,z:out.x};
    if(along.x*22+along.z*28<0){along.x*=-1;along.z*=-1;}
    const door={x:(near.x+far.x)/2,z:(near.z+far.z)/2};
    const switchPosition={x:door.x+out.x*1.1-along.x*.6,z:door.z+out.z*1.1-along.z*.6};
    const switchGroup=new THREE.Group();switchGroup.position.set(switchPosition.x,0,switchPosition.z);model.add(switchGroup);
    box(switchGroup,.14,1.58,.14,0,.81,0,edge,.026);
    // A small foot anchors the freestanding switch at the corridor edge.
    box(switchGroup,.3,.1,.3,0,.06,0,mat(0x769b9b,.45),.025);
    const switchHead=new THREE.Group();switchHead.position.y=1.57;switchHead.rotation.set(-.28,Math.atan2(22,28),0);switchGroup.add(switchHead);
    box(switchHead,.79,.93,.22,0,0,0,mat(0x456976,.45,.35),.075);
    const switchSignal=glow(0x8bbebc,.45);
    for(const side of [-1,1])box(switchHead,.045,.77,.025,side*.352,0,.123,switchSignal,.009);
    const switchFaces={idle:lockdownScreen('idle'),ready:lockdownScreen('ready'),locked:lockdownScreen('locked')};
    const switchFace=new THREE.Mesh(new THREE.PlaneGeometry(.65,.76),switchFaces.idle);switchFace.position.set(0,.045,.123);switchHead.add(switchFace);
    const switchLever=box(switchHead,.22,.065,.13,0,-.383,.165,switchSignal,.018);
    const consoleLabel=deviceLabel(consoleData.id,'console',consoleData.x,consoleData.z,'V · VAULT DOOR SWITCH','#b9dfdc',level.compromisedGrantId);
    consoleLabel.anchor.set(switchPosition.x,3,switchPosition.z);
    consoleLabel.element.dataset.doorSwitch='true';
    Object.assign(consoleLabel.element.style,{padding:'7px 10px',fontSize:'12px',borderWidth:'2px'});
    // The airlock frame retains a clear vertical barrier and bright state lamp.
    const gates:THREE.Group[]=[],shutters:THREE.Mesh[]=[],gateLamps:THREE.Mesh[]=[];
    for(const data of level.gates){
      const grantColor=data.grantId?new THREE.Color(level.grants.find(d=>d.id===data.grantId)!.color).getHex():0xb3c9b0;
      const g=new THREE.Group();g.position.set((data.a.x+data.b.x)/2,0,(data.a.z+data.b.z)/2);if(data.a.z!==data.b.z)g.rotation.y=Math.PI/2;model.add(g);gates.push(g);
      for(const side of [-1,1]){
        box(g,.23,1.18,.15,0,.58,side*.48,edge,.04);
        box(g,.045,.88,.06,.13,.61,side*.47,glow(grantColor,.75),.015);
      }
      box(g,.23,.15,1.12,0,1.19,0,mat(0x829b99,.4),.04);
      const shutter=box(g,.055,1.03,.81,0,.59,0,new THREE.MeshStandardMaterial({color:C.cyan,emissive:C.cyan,emissiveIntensity:.45,transparent:true,opacity:.28,metalness:.1,roughness:.2,side:THREE.DoubleSide}),.012);shutters.push(shutter);
      const lamp=box(g,.045,.075,.35,.14,1.19,0,glow(C.gold,.8));gateLamps.push(lamp);
      for(let i=0;i<4;i++)box(g,.31,.025,.08,0,.045,-.35+i*.23,glow(grantColor,.4),.006);
      const definition=level.grants.find(d=>d.id===data.grantId),mark=definition?`${definition.id==='transit'?'T':'V'} · ${definition.label.toUpperCase()}`:'NO KEY';
      const plaque=scopeSign(model,mark,g.position.x,1.42,g.position.z,1.55,definition?.color??'#d1dfcb');plaque.quaternion.copy(camera.quaternion);
    }
    // Optional data chips use three instanced meshes, keeping the larger maze
    // inexpensive to render while collected chips disappear immediately.
    const chipGroups:{mesh:THREE.InstancedMesh;positions:{x:number;z:number}[]}[]=[];
    const matrix=new THREE.Matrix4(),dummy=new THREE.Object3D();
    for(const zone of ['service','vault','escape']){
      const positions=level.shards.filter(p=>zoneAt(p.x,p.z)===zone);
      const mesh=new THREE.InstancedMesh(new THREE.OctahedronGeometry(.067,0),glow(zone==='vault'?C.gold:zone==='service'?0x4c919b:0xc3f8dd,.42),positions.length);
      mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);mesh.frustumCulled=false;
      positions.forEach((p,i)=>{dummy.position.set(p.x,.14,p.z);dummy.rotation.set(0,Math.PI/4,0);dummy.scale.set(1,.68,1);dummy.updateMatrix();mesh.setMatrixAt(i,dummy.matrix);});
      model.add(mesh);chipGroups.push({mesh,positions});
    }
    const extractionData=level.objects.find(o=>o.type==='extraction')!;
    const extraction=new THREE.Group();extraction.position.set(extractionData.x,0,extractionData.z);model.add(extraction);
    cyl(extraction,.43,.035,0,.042,0,mat(0x274e52,.4));const extractRing=ring(extraction,.35,.027,0,.074,0,C.cyan);
    for(let i=0;i<3;i++){const b=box(extraction,.15,.023,.05,-.21+i*.21,.081,0,glow(C.cyan,.7),.01);b.name='hold-'+i;}
    const beam=new THREE.Mesh(new THREE.CylinderGeometry(.26,.39,1.9,32,1,true),new THREE.MeshBasicMaterial({color:C.cyan,transparent:true,opacity:.065,side:THREE.DoubleSide,depthWrite:false}));beam.position.set(extractionData.x,1.04,extractionData.z);model.add(beam);
    const player=droneModel();model.add(player);
    player.position.set(stateRef.current.player.x,.1,stateRef.current.player.z);
    const carried=box(player,.19,.19,.19,0,1.18,0,gold,.025);
    const playerRing=ring(model,.43,.018,stateRef.current.player.x,.043,stateRef.current.player.z,C.cyan);
    const sentries=level.sentries.map(data=>{
      const actor=droneModel(true,data.behavior);actor.position.set(data.start.x,.1,data.start.z);model.add(actor);
      const indicator=ring(model,.43,.02,data.start.x,.043,data.start.z,C.red);
      return {data,actor,indicator,last:{...data.start},angle:0};
    });
    const interactionRing=ring(model,.46,.026,consoleData.x,.042,consoleData.z,C.cyan);interactionRing.visible=false;
    const sparkles=new THREE.Group();model.add(sparkles);
    for(let i=0;i<10;i++){const p=new THREE.Mesh(new THREE.OctahedronGeometry(.025),glow(C.gold,1.3));p.position.set(packageData.x+Math.cos(i*2.4)*.5,.3+(i%5)*.18,packageData.z+Math.sin(i*2.4)*.5);sparkles.add(p);}
    // Batch static architectural meshes by material; actors, gates and pickup
    // animation stay independent. Instanced chip fields are already batched.
    const dynamicRoots=new Set<THREE.Object3D>([player,playerRing,interactionRing,packageGroup,cage,packageBeacon,beam,extraction,switchGroup,sparkles,...accessKeys.flatMap(k=>[k.group,k.badge]),...renewals.map(r=>r.group),...sentries.flatMap(s=>[s.actor,s.indicator]),...gates,...chipGroups.map(g=>g.mesh)]);
    const fixed:THREE.Mesh[]=[];model.updateMatrixWorld(true);
    const batches=new Map<string,{material:THREE.Material,geometries:THREE.BufferGeometry[]}>();
    model.traverse(o=>{
      if(!(o instanceof THREE.Mesh)||Array.isArray(o.material))return;
      for(let p:THREE.Object3D|null=o;p&&p!==model;p=p.parent)if(dynamicRoots.has(p))return;
      const material=o.material as THREE.MeshStandardMaterial;if(material.map)return;
      const id=JSON.stringify([material.type,material.color?.getHex(),material.emissive?.getHex(),material.emissiveIntensity,material.roughness,material.metalness,material.transparent,material.opacity,material.side]);
      let batch=batches.get(id);if(!batch){batch={material,geometries:[]};batches.set(id,batch);}
      const geometry=(o.geometry.index?o.geometry.toNonIndexed():o.geometry.clone()).applyMatrix4(o.matrixWorld);geometry.deleteAttribute('uv');geometry.deleteAttribute('uv1');batch.geometries.push(geometry);fixed.push(o);
    });
    for(const batch of batches.values()){
      if(!batch.geometries.length)continue;
      const geometry=mergeGeometries(batch.geometries);if(!geometry)continue;
      const mesh=new THREE.Mesh(geometry,batch.material);mesh.castShadow=true;mesh.receiveShadow=true;model.add(mesh);for(const g of batch.geometries)g.dispose();
    }
    for(const mesh of fixed){mesh.removeFromParent();mesh.geometry.dispose();}
    let frames=0,lastSample=performance.now(),last=lastSample,frame=0,alive=true,lastEvent=-1,deniedAt=-1000,pickupAt=-1000,lastShardCount=-1;
    let lastPlayer={...stateRef.current.player},playerAngle=0,lastOverview=overviewRef.current;
    const frameDurations:number[]=[];
    function resize(){
      const w=Math.max(1,el.clientWidth),h=Math.max(1,el.clientHeight);renderer.setSize(w,h);const aspect=w/h;
      camera.updateMatrixWorld();
      const bounds=new THREE.Box3(new THREE.Vector3(-.7,-.7,-.7),new THREE.Vector3(level.width-.3,1.6,level.depth-.3));
      const projected:THREE.Vector3[]=[];
      for(const x of [bounds.min.x,bounds.max.x])for(const y of [bounds.min.y,bounds.max.y])for(const z of [bounds.min.z,bounds.max.z])projected.push(new THREE.Vector3(x,y,z).applyMatrix4(camera.matrixWorldInverse));
      const spanX=Math.max(...projected.map(p=>p.x))-Math.min(...projected.map(p=>p.x));
      const spanY=Math.max(...projected.map(p=>p.y))-Math.min(...projected.map(p=>p.y));
      const worldWidth=overviewRef.current?Math.max(spanX+3,(spanY+3)*aspect):Math.max(18,14*aspect);
      const offset=overviewRef.current&&aspect>=1.4?1:0;
      camera.left=-worldWidth/2-offset;camera.right=worldWidth/2-offset;camera.top=worldWidth/(2*aspect)+.35;camera.bottom=-worldWidth/(2*aspect)+.35;camera.near=.1;camera.far=120;camera.updateProjectionMatrix();
    }
    const ro=new ResizeObserver(resize);ro.observe(el);resize();
    const face=(actor:THREE.Object3D,target:number,speed:number)=>{actor.rotation.y+=Math.atan2(Math.sin(target-actor.rotation.y),Math.cos(target-actor.rotation.y))*speed;};
    const glide=(actor:THREE.Object3D,target:{x:number;z:number},step:number,snap:boolean)=>{
      const dx=target.x-actor.position.x,dz=target.z-actor.position.z,distance=Math.hypot(dx,dz);
      if(snap||distance>2.2){actor.position.x=target.x;actor.position.z=target.z;}
      else if(distance>0){const amount=Math.min(1,step/distance);actor.position.x+=dx*amount;actor.position.z+=dz*amount;}
    };
    function animate(now:number){
      if(!alive)return;frame=requestAnimationFrame(animate);const s=stateRef.current,dt=Math.min((now-last)/1000,.05);frameDurations.push(now-last);if(frameDurations.length>600)frameDurations.shift();last=now;
      const motion=motionRef.current,t=motion?0:now*.001,frozen=s.status==='paused',speed=motion?1:1-Math.exp(-dt*18);
      if(s.eventId!==lastEvent){if(s.event==='denied')deniedAt=now;if(s.event==='pickup')pickupAt=now;lastEvent=s.eventId;}
      const deniedPulse=motion?0:Math.max(0,1-(now-deniedAt)/650);
      if(s.player.x!==lastPlayer.x||s.player.z!==lastPlayer.z){playerAngle=Math.atan2(s.player.x-lastPlayer.x,s.player.z-lastPlayer.z);lastPlayer={...s.player};}
      glide(player,s.player,dt*6.3,motion);
      player.position.y=.09+(frozen?0:Math.sin(t*3)*.035);face(player,playerAngle,speed);
      playerRing.position.set(player.position.x,.043,player.position.z);
      for(const unit of sentries){
        const live=s.sentries.find(candidate=>candidate.id===unit.data.id);if(!live)continue;
        if(live.position.x!==unit.last.x||live.position.z!==unit.last.z){unit.angle=Math.atan2(live.position.x-unit.last.x,live.position.z-unit.last.z);unit.last={...live.position};}
        glide(unit.actor,live.position,dt*(1000/unit.data.stepMs+1),motion);unit.actor.position.y=.09+(frozen?0:Math.sin(t*2.5+unit.data.stepMs)*.028);face(unit.actor,unit.angle,speed);
        unit.indicator.position.set(unit.actor.position.x,.043,unit.actor.position.z);
        const signal=unit.indicator.material as THREE.MeshStandardMaterial;signal.color.setHex(live.mode==='patrol'?C.gold:live.mode==='blocked'?C.cyan:C.red);signal.emissive.copy(signal.color);signal.emissiveIntensity=.4+(live.mode==='chase'&&!motion?Math.sin(t*6)*.15:0);
      }
      const contextObject=level.objects.find(o=>o.id===s.contextObjectId);
      const vaultGrant=s.grants.find(grant=>grant.id===level.compromisedGrantId),locked=!!vaultGrant?.revoked;
      const needsLockdown=s.carrying&&!locked;
      const switchMode=locked?'locked':needsLockdown?'ready':'idle';
      switchFace.material=switchFaces[switchMode];
      switchSignal.color.setHex(locked?0x8de6c6:needsLockdown?0xffbd60:0x8bbebc);switchSignal.emissive.copy(switchSignal.color);
      switchSignal.emissiveIntensity=needsLockdown?1.1+(motion?0:Math.sin(t*4)*.18):locked?.65:.3;
      switchLever.rotation.z=locked?Math.PI/2:0;
      interactionRing.visible=!!contextObject&&s.status==='playing';
      if(contextObject)interactionRing.position.set(contextObject.x,.042,contextObject.z);
      interactionRing.scale.setScalar(1+Math.sin(t*4)*.04);
      carried.visible=s.carrying;
      for(const key of accessKeys){const grant=s.grants.find(g=>g.id===key.data.grantId);key.group.visible=!grant||grant.revoked||s.elapsedMs>=grant.expiresAt;key.badge.visible=key.group.visible;key.group.rotation.y=t*.65;key.group.position.y=.59+Math.sin(t*2.6)*.045;}
      for(const reader of renewals){const grant=s.grants.find(g=>g.id===reader.data.grantId),definition=level.grants.find(g=>g.id===reader.data.grantId)!;const fraction=grant&&!grant.revoked?Math.max(0,(grant.expiresAt-s.elapsedMs)/definition.lifetimeMs):0;(reader.light.material as THREE.MeshStandardMaterial).emissiveIntensity=.5+(1-fraction)*1.1;}
      packageGroup.visible=!s.carrying;cage.visible=!s.carrying;packageBeacon.visible=!s.carrying;packageGroup.rotation.y=t*.45;packageGroup.position.y=.7+Math.sin(t*2)*.05;packageBeacon.scale.setScalar(1+Math.sin(t*2.3)*.04);
      for(let i=0;i<shutters.length;i++){
        const data=level.gates[i]!,grant=s.grants.find(g=>g.id===data.grantId),allowed=data.grantId===null||!!grant&&!grant.revoked&&s.elapsedMs<grant.expiresAt;
        const base=data.grantId?new THREE.Color(level.grants.find(g=>g.id===data.grantId)!.color).getHex():0xb3c9b0;
        shutters[i].scale.y=THREE.MathUtils.lerp(shutters[i].scale.y,allowed?.06:1,speed);shutters[i].position.y=allowed?1.1:.59;
        const lamp=gateLamps[i].material as THREE.MeshStandardMaterial;lamp.color.setHex(grant?.revoked?C.red:allowed?C.cyan:base);lamp.emissive.copy(lamp.color);
        const material=shutters[i].material as THREE.MeshStandardMaterial;material.color.setHex(grant?.revoked?C.red:base);material.emissive.copy(material.color);material.opacity=(grant?.revoked?.42:.23)+(motion?0:Math.sin(t*3)*.035);material.emissiveIntensity=.45+deniedPulse*1.8;
      }
      if(s.collectedShards.length!==lastShardCount){
        const collected=new Set(s.collectedShards);
        for(const group of chipGroups){group.positions.forEach((position,i)=>{dummy.position.set(position.x,.14,position.z);dummy.rotation.set(0,Math.PI/4,0);dummy.scale.setScalar(collected.has(`${position.x},${position.z}`)?0:1);dummy.scale.y*=.68;dummy.updateMatrix();matrix.copy(dummy.matrix);group.mesh.setMatrixAt(i,matrix);});group.mesh.instanceMatrix.needsUpdate=true;}
        lastShardCount=s.collectedShards.length;
      }
      beam.visible=s.carrying;extractRing.scale.setScalar(1+Math.sin(t*2)*.025);
      for(let i=0;i<3;i++){const m=extraction.getObjectByName('hold-'+i) as THREE.Mesh;(m.material as THREE.MeshStandardMaterial).emissiveIntensity=s.extractionProgress>(i/3)?2:.15;}
      const burst=Math.max(0,1-(now-pickupAt)/950);sparkles.visible=!s.carrying||burst>0;
      for(let i=0;i<sparkles.children.length;i++){const p=sparkles.children[i];p.position.y=.3+(i%5)*.18+Math.sin(t*2+i)*.06+(s.carrying?(1-burst)*1.1:0);p.scale.setScalar(s.carrying?burst:1);}
      if(lastOverview!==overviewRef.current){lastOverview=overviewRef.current;resize();}
      const focus=overviewRef.current?{x:cx,z:cz}:player.position;
      const cameraSpeed=motion?1:1-Math.exp(-dt*7);
      camera.position.x=THREE.MathUtils.lerp(camera.position.x,focus.x+22,cameraSpeed);camera.position.z=THREE.MathUtils.lerp(camera.position.z,focus.z+28,cameraSpeed);
      // Parallel translation preserves the diorama angle while following turns.
      camera.updateMatrixWorld();
      const placed:{left:number;right:number;top:number;bottom:number}[]=[];
      for(const label of [...labels].sort((a,b)=>Number(b.id===s.contextObjectId)-Number(a.id===s.contextObjectId))){
        const grant=s.grants.find(g=>g.id===label.grantId),distance=Math.abs(s.player.x-label.x)+Math.abs(s.player.z-label.z);
        const available=label.kind!=='key'||!grant||grant.revoked||s.elapsedMs>=grant.expiresAt;
        const isSwitch=label.kind==='console',guideToSwitch=isSwitch&&needsLockdown;
        const shown=available&&(guideToSwitch||label.kind==='key'||label.id===s.contextObjectId||distance<=(label.kind==='gate'?3:4));
        const projected=label.anchor.clone().project(camera);let x=(projected.x*.5+.5)*el.clientWidth;
        let y=(-projected.y*.5+.5)*el.clientHeight;
        if(!shown||(!guideToSwitch&&(projected.z< -1||projected.z>1||x<75||x>el.clientWidth-75||y<70||y>el.clientHeight-90))){label.element.style.display='none';continue;}
        const switchAction=isSwitch&&s.status==='playing'&&label.id===s.contextObjectId;
        let labelText=isSwitch?(locked?'✓ · VAULT LOCKED':switchAction?'E · LOCK VAULT BEHIND YOU':needsLockdown?'LOCK VAULT · DOOR SWITCH':'V · VAULT DOOR SWITCH'):label.id===s.contextObjectId&&label.kind!=='key'?`E · ${label.text}`:label.text;
        if(isSwitch){const color=needsLockdown?'#ffce83':locked?'#a6f4da':'#b9dfdc';Object.assign(label.element.style,{color,borderColor:color,background:needsLockdown?'#382c20f5':'#102b2df5',boxShadow:switchAction?'0 0 0 3px #ffcb7435, 0 3px 12px #0009':'0 3px 10px #0009'});}
        label.element.textContent=labelText;label.element.style.display='block';
        let width=label.element.offsetWidth;const height=label.element.offsetHeight;
        if(guideToSwitch){
          // The one active mission target remains findable in follow view. An
          // edge arrow guides back to its door without claiming E is in range.
          const side=Math.min(300,el.clientWidth*.23),minX=side+width/2,maxX=el.clientWidth-side-width/2;
          const shownX=THREE.MathUtils.clamp(x,minX,maxX),shownY=THREE.MathUtils.clamp(y,150+height,el.clientHeight-145);
          if(Math.abs(shownX-x)>2||Math.abs(shownY-y)>2){
            const arrows=['→','↘','↓','↙','←','↖','↑','↗'],angle=Math.atan2(y-shownY,x-shownX);
            labelText=`${arrows[(Math.round(angle/(Math.PI/4))+8)%8]} ${labelText}`;label.element.textContent=labelText;width=label.element.offsetWidth;
          }
          x=THREE.MathUtils.clamp(shownX,side+width/2,el.clientWidth-side-width/2);y=shownY;
        }
        for(const other of placed)if(x-width/2<other.right+5&&x+width/2>other.left-5&&y>other.top-5&&y-height<other.bottom+5)y=other.top-7;
        label.element.style.left=`${x}px`;label.element.style.top=`${y}px`;placed.push({left:x-width/2,right:x+width/2,top:y-height,bottom:y});
      }
      renderer.render(scene,camera);frames++;
      if(now-lastSample>1500){const fps=Math.round(frames*1000/(now-lastSample));readyRef.current?.(fps);frames=0;lastSample=now;
        (window as unknown as {ghostProtocolRenderStats:unknown}).ghostProtocolRenderStats={fps,drawCalls:renderer.info.render.calls,triangles:renderer.info.render.triangles,pixelRatio:renderer.getPixelRatio(),renderer:renderer.getContext().getParameter(renderer.getContext().RENDERER),framesMeasured:frameDurations.length,meanFrameMs:frameDurations.reduce((a,b)=>a+b,0)/Math.max(1,frameDurations.length)};
      }
    }
    frame=requestAnimationFrame(animate);
    return()=>{alive=false;cancelAnimationFrame(frame);ro.disconnect();for(const material of Object.values(switchFaces))if(material!==switchFace.material){material.map?.dispose();material.dispose();}scene.traverse(o=>{if(o instanceof THREE.Mesh||o instanceof THREE.LineSegments){o.geometry.dispose();const materials=Array.isArray(o.material)?o.material:[o.material];for(const material of materials){if('map' in material&&(material as THREE.MeshBasicMaterial).map)(material as THREE.MeshBasicMaterial).map!.dispose();material.dispose();}}});renderer.dispose();labelLayer.remove();el.removeChild(renderer.domElement);};
  },[state.levelId]);
  return <div ref={host} className="game-scene" style={{position:'absolute',inset:0}} />;
}
