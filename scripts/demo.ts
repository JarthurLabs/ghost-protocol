import { LEVELS } from '../shared/level.js';
import { applyCommand, replayDefender } from '../server/engine.js';
import { runMission } from '../tests/campaign-routes.js';

for(const level of LEVELS){
  const game=runMission(level.id);
  if(game.status!=='won')throw new Error(`Mission ${level.id} ended ${game.status}: ${game.message}`);
  const denied=game.decisions.filter(decision=>decision.actor!=='drone'&&!decision.allow&&decision.reason==='role revoked');
  if(!denied.length)throw new Error(`Mission ${level.id} finished without a pursuing enemy actually reaching a revoked gate.`);
  console.log(`Mission ${level.id}, ${level.title}: won in ${(game.elapsedMs/1000).toFixed(2)} seconds, ${game.turn} tiles, ${game.sentries.length} active enemies. ${denied.length} actual revoked-gate denials.`);
  if(level.id===5){
    applyCommand(game,{type:'defender-start'});applyCommand(game,{type:'defender-patch',patch:'least-privilege'});
    if(!game.defender?.success)throw new Error('The defender finale did not preserve maintenance while denying the attacker.');
  }
}
for(const patch of ['open','shutdown','least-privilege'] as const){
  const replay=replayDefender(patch);
  console.log(`Defender ${patch}: attacker ${replay.attackerDenied?'denied':'allowed'}, maintenance ${replay.maintenanceAllowed?'allowed':'denied'}, success ${replay.success}.`);
  console.log(JSON.stringify(replay.decisions));
}
