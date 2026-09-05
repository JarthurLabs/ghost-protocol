import { getLevel } from '../shared/level.js';
import { advanceGame, applyCommand, createGame, EXTRACTION_MS, type EngineState } from '../server/engine.js';
import { travel } from './maze-helpers.js';

/** Hand-authored public reference routes. Every tile is traversed on the server clock. */
export const CAMPAIGN_ROUTES: Record<number, [number,number][]> = {
  1: [[3,11],[5,11],[5,7],[7,7],[7,3],[11,3],[11,1],[11,3],[13,3],[13,5],[15,5],[15,9],[17,9],[21,9],[21,13]],
  2: [[3,11],[7,11],[7,7],[11,7],[11,3],[13,3],[15,3],[15,5],[17,5],[17,9],[19,9],[23,9],[23,13]],
  3: [[3,13],[5,13],[5,9],[7,9],[7,5],[11,5],[11,1],[15,1],[15,5],[17,5],[17,9],[17,13],[19,13],[25,13],[25,15]],
  4: [[3,13],[1,13],[1,9],[5,9],[9,9],[9,3],[13,3],[13,1],[13,3],[17,3],[17,7],[19,7],[19,11],[21,11],[25,11],[25,15],[27,15]],
  5: [[3,15],[1,15],[1,11],[5,11],[9,11],[13,11],[13,7],[11,7],[11,3],[15,3],[15,1],[19,1],[19,5],[17,5],[17,9],[21,9],[21,13],[21,15],[23,15],[27,15],[27,17],[29,17]],
};
export function runMission(levelId:number,observe?:(game:EngineState)=>void,startDelayMs=0){
  const game=createGame(levelId),level=getLevel(levelId);applyCommand(game,{type:'start'});advanceGame(game,startDelayMs);
  for(const [x,z] of CAMPAIGN_ROUTES[levelId]!){
    travel(game,{x,z});
    const item=level.objects.find(object=>object.x===x&&object.z===z);
    if(item?.type==='renewal')applyCommand(game,{type:'interact'});
    if(item?.type==='console')applyCommand(game,{type:'interact'});
    observe?.(game);
  }
  advanceGame(game,EXTRACTION_MS);observe?.(game);
  return game;
}
