export const PROGRESS_KEY='ghost-protocol-campaign-v1';
export interface MissionResult { bestMs:number; bestChips:number; completions:number }
export interface CampaignProgress {
  version:1; unlocked:number; results:Record<number,MissionResult>;
  introSeen:boolean; defenderComplete:boolean; seenRuns:string[];
}
export const emptyProgress=():CampaignProgress=>({version:1,unlocked:1,results:{},introSeen:false,defenderComplete:false,seenRuns:[]});
const whole=(value:unknown,min:number,max:number):value is number=>typeof value==='number'&&Number.isInteger(value)&&value>=min&&value<=max;
function unlock(results:Record<number,MissionResult>){let next=1;while(next<5&&results[next])next++;return next;}
export function parseProgress(raw:string|null):CampaignProgress {
  const blank=emptyProgress();if(!raw)return blank;
  try {
    const data=JSON.parse(raw);if(!data||Array.isArray(data)||data.version!==1)return blank;
    const results:Record<number,MissionResult>={};
    for(let id=1;id<=5;id++){
      const item=data.results?.[id];
      if(item&&typeof item.bestMs==='number'&&Number.isFinite(item.bestMs)&&item.bestMs>0&&item.bestMs<=21_600_000&&whole(item.bestChips,0,100000)&&whole(item.completions,1,100000))results[id]={bestMs:item.bestMs,bestChips:item.bestChips,completions:item.completions};
    }
    return {...blank,results,unlocked:unlock(results),introSeen:data.introSeen===true,defenderComplete:data.defenderComplete===true&&Boolean(results[5]),seenRuns:Array.isArray(data.seenRuns)?data.seenRuns.filter((id:unknown)=>typeof id==='string'&&id.length<100).slice(-40):[]};
  }catch{return blank;}
}
export function recordCompletion(progress:CampaignProgress,run:{runId:string;levelId:number;elapsedMs:number;chips:number}):CampaignProgress {
  if(progress.seenRuns.includes(run.runId)||!whole(run.levelId,1,5)||!Number.isFinite(run.elapsedMs)||run.elapsedMs<=0||!whole(run.chips,0,100000))return progress;
  const previous=progress.results[run.levelId];
  const results={...progress.results,[run.levelId]:{bestMs:Math.min(previous?.bestMs??Infinity,run.elapsedMs),bestChips:Math.max(previous?.bestChips??0,run.chips),completions:(previous?.completions??0)+1}};
  return {...progress,results,unlocked:unlock(results),seenRuns:[...progress.seenRuns,run.runId].slice(-40)};
}
export function loadProgress(){try{return parseProgress(localStorage.getItem(PROGRESS_KEY));}catch{return emptyProgress();}}
export function saveProgress(progress:CampaignProgress){try{localStorage.setItem(PROGRESS_KEY,JSON.stringify(progress));return true;}catch{return false;}}
