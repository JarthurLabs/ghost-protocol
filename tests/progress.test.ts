import test from 'node:test';
import assert from 'node:assert/strict';
import { emptyProgress, parseProgress, recordCompletion } from '../src/progress.js';
test('malformed and older saves never prevent opening a fresh campaign',()=>{
  for(const value of [null,'','not json','null','[]','{"version":99}'])assert.deepEqual(parseProgress(value),emptyProgress());
});
test('completion unlocks the next mission and retains independent best time and chip score',()=>{
  let progress=recordCompletion(emptyProgress(),{runId:'first',levelId:1,elapsedMs:30000,chips:14});
  assert.equal(progress.unlocked,2);assert.equal(progress.results[1]?.bestMs,30000);
  progress=recordCompletion(progress,{runId:'second',levelId:1,elapsedMs:40000,chips:22});
  assert.equal(progress.results[1]?.bestMs,30000);assert.equal(progress.results[1]?.bestChips,22);assert.equal(progress.results[1]?.completions,2);
  assert.deepEqual(parseProgress(JSON.stringify(progress)),progress);
});
test('reloading an already completed run does not count it twice',()=>{
  const run={runId:'same-run',levelId:1,elapsedMs:30000,chips:9};
  const once=recordCompletion(emptyProgress(),run);
  assert.deepEqual(recordCompletion(once,run),once);
});
test('only contiguous completed missions unlock progression, and corrupt score fields are rejected',()=>{
  const outOfOrder=recordCompletion(emptyProgress(),{runId:'test',levelId:4,elapsedMs:10,chips:0});
  assert.equal(outOfOrder.unlocked,1);
  const saved=parseProgress(JSON.stringify({version:1,introSeen:true,defenderComplete:false,unlocked:99,seenRuns:[],results:{1:{bestMs:-1,bestChips:0,completions:1}}}));
  assert.equal(saved.unlocked,1);assert.deepEqual(saved.results,{});assert.equal(saved.introSeen,true);
});
