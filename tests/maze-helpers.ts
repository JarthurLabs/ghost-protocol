import { getLevel, LEVEL } from '../shared/level.js';
import { advanceGame, applyCommand, type EngineState, PLAYER_STEP_MS } from '../server/engine.js';
import type { LevelDefinition, LevelObject } from '../shared/campaign-schema.js';
import type { Direction, Position } from '../shared/types.js';

export const offsets: Record<Direction, Position> = {
  north: {x:0,z:-1}, east: {x:1,z:0}, south: {x:0,z:1}, west: {x:-1,z:0},
};
export const key = (p:Position) => `${p.x},${p.z}`;
export const same = (a:Position,b:Position) => key(a)===key(b);
export function neighbors(p:Position,level:LevelDefinition=LEVEL,avoidGates:string[]=[]) {
  const from=level.tiles.find(t=>same(t,p));
  return Object.entries(offsets).flatMap(([direction,offset])=>{
    const next={x:p.x+offset.x,z:p.z+offset.z};
    const to=level.tiles.find(t=>same(t,next));
    if(!from||!to||level.walls.some(w=>same(w,next)))return [];
    const gate=level.gates.find(g=>(same(g.a,p)&&same(g.b,next))||(same(g.b,p)&&same(g.a,next)));
    if(gate&&avoidGates.includes(gate.id))return [];
    return from.zone===to.zone||gate?[{direction:direction as Direction,position:next}]:[];
  });
}
export function path(from:Position,to:Position,level:LevelDefinition=LEVEL,avoidGates:string[]=[],avoidTiles:Position[]=[]):Direction[] {
  const queue=[{position:from,route:[] as Direction[]}],seen=new Set([key(from),...avoidTiles.map(key)]);
  for(let i=0;i<queue.length;i++){
    const current=queue[i]!;
    if(same(current.position,to))return current.route;
    for(const next of neighbors(current.position,level,avoidGates))if(!seen.has(key(next.position))){
      seen.add(key(next.position));queue.push({position:next.position,route:[...current.route,next.direction]});
    }
  }
  throw new Error(`No physical route from ${key(from)} to ${key(to)}`);
}
export function travel(game:EngineState,to:Position,avoidGates:string[]=[],avoidTiles:Position[]=[]){
  const level=getLevel(game.levelId);
  for(const direction of path(game.player,to,level,avoidGates,avoidTiles)){
    const expected={x:game.player.x+offsets[direction].x,z:game.player.z+offsets[direction].z};
    applyCommand(game,{type:'move',direction});advanceGame(game,PLAYER_STEP_MS-game.playerClockMs);
    if(game.status!=='playing')throw new Error(`Travel ended ${game.status} at ${key(game.player)}: ${game.message}`);
    if(!same(game.player,expected))throw new Error(`Travel denied toward ${key(expected)}: ${game.message}`);
  }
  applyCommand(game,{type:'wait'});
}
export function object(type:LevelObject['type'],level:LevelDefinition=LEVEL,grantId?:string) {
  return level.objects.find(o=>o.type===type&&(!grantId||o.grantId===grantId))!;
}
