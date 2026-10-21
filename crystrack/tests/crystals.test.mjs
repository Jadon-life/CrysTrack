import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import ts from 'typescript';import {createRequire} from 'node:module';
const compiled=ts.transpileModule(fs.readFileSync('src/lib/crystals.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText;
const loaded={exports:{}};new Function('require','module','exports',compiled)(createRequire(import.meta.url),loaded,loaded.exports);
const {crystalProgress,crystalStage,crystalStateSchema,crystalSettingsSchema}=loaded.exports;
test('original crystal segment thresholds: zero/499/500/1099/1100',()=>{
 for(const [total,level,toward,requirement] of [['0',1,'0','500'],['499',1,'499','500'],['500',2,'0','600'],['1099',2,'599','600'],['1100',3,'0','720']]){
  const result=crystalProgress(total);assert.equal(result.level,level);assert.equal(result.toward,toward);assert.equal(result.requirement,requirement);
 }
});
test('20 percent growth rounds each integer segment UP; stages and cumulative boundaries exact',()=>{
 let cumulative=0n,segment=500n;
 for(let level=1;level<=30;level++){
  const result=crystalProgress(cumulative);assert.equal(result.level,level);assert.equal(result.requirement,String(segment));
  assert.equal(result.stage,crystalStage(level));assert.ok(crystalProgress(cumulative+segment-1n).percent<100);
  cumulative+=segment;segment=(segment*6n+4n)/5n;
 }
 assert.equal(crystalProgress('2684').requirement,'1037');
 for(const [n,stage] of [[1,'Raw'],[2,'Raw'],[3,'Shard'],[4,'Shard'],[5,'Cluster'],[6,'Cluster'],[7,'Prism'],[9,'Prism'],[10,'Radiant'],[100,'Radiant']])assert.equal(crystalStage(n),stage);
});
test('integer totals beyond JavaScript safe integers retain precise progress; invalid inputs fail',()=>{
 const total=9007199254740993n;const result=crystalProgress(total);assert.equal(result.total,String(total));assert.ok(result.percent>=0&&result.percent<100);
 for(const input of ['-1','1.5','NaN','01',''])assert.throws(()=>crystalProgress(input));
 assert.throws(()=>crystalProgress(-1n));assert.throws(()=>crystalStage(0));
});
test('settings cannot carry a shard amount or another owner; malformed totals fail closed',()=>{
 assert.throws(()=>crystalSettingsSchema.parse({enabled:true,revision:1,shards:500}));
 assert.throws(()=>crystalSettingsSchema.parse({enabled:true,revision:1,userId:'other'}));
 assert.throws(()=>crystalStateSchema.parse({enabled:true,revision:1,total:500,pendingMoment:false}));
});
test('migration is additive, isolated, no backfill, non-public private functions and no activity proof',()=>{
 const sql=fs.readFileSync('src/db/migrations/0015_sep28_crystal_shards.sql','utf8');
 assert.match(sql,/CREATE SCHEMA crystrack_sep28_crystals/);assert.match(sql,/ENABLE ROW LEVEL SECURITY/);
 assert.match(sql,/REVOKE ALL ON ALL FUNCTIONS IN SCHEMA crystrack_sep28_crystals/);
 assert.doesNotMatch(sql,/gamification_events|xp_events|UPDATE public\.money_entries|ALTER TABLE public\.money_entries|FROM public\.activity_events|DELETE FROM public\./);
 assert.doesNotMatch(sql,/CREATE OR REPLACE|DISABLE.*TRIGGER|DISABLE ROW LEVEL|session_replication_role/);
});
