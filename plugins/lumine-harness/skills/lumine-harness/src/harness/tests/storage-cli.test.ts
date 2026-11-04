import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,writeFileSync,readFileSync,rmSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import os from 'node:os';
import path from 'node:path';

test('storage CLI saves an exact reviewed plan, rejects a wrong hash and offers JSON recovery',()=>{
 const root=mkdtempSync(path.join(os.tmpdir(),'lumine-storage-cli-'));
 const module=new URL('../wiki-main'+path.extname(new URL(import.meta.url).pathname),import.meta.url).href;
 const run=(args:string[])=>spawnSync(process.execPath,[...(module.endsWith('.ts')?['--import','tsx']:[]),'--input-type=module','-e',`const {runWikiCli}=await import(${JSON.stringify(module)});await runWikiCli(${JSON.stringify([...args,'--root',root,'--json'])});`],{encoding:'utf8'});
 try{
  mkdirSync(path.join(root,'.lumine'));writeFileSync(path.join(root,'.lumine/root.json'),JSON.stringify({schemaVersion:2,kind:'lumine-root',projectId:'storage-cli'}));
  const config=JSON.stringify({schemaVersion:2,workflowVersion:2,locale:'zh-CN'});writeFileSync(path.join(root,'.lumine/project.json'),config);
  const file=path.join(root,'plan.json'),planned=run(['storage','compact','--plan','--output',file]);assert.equal(planned.status,0,planned.stderr);const data=JSON.parse(planned.stdout);assert.equal(data.planSha256,createHash('sha256').update(readFileSync(file)).digest('hex'));
  const wrong=run(['storage','compact','--apply',file,'--expect','0'.repeat(64)]);assert.notEqual(wrong.status,0);assert.equal(JSON.parse(wrong.stderr).code,'STORAGE_PLAN_HASH_MISMATCH');assert.equal(readFileSync(path.join(root,'.lumine/project.json'),'utf8'),config);
  const applied=run(['storage','compact','--apply',file,'--expect',data.planSha256]);assert.equal(applied.status,0,applied.stderr);assert.equal(JSON.parse(applied.stdout).status,'complete');
  assert.equal(JSON.parse(run(['storage','check']).stdout).ok,true);
  const rollback=run(['storage','recover',data.operationId,'--rollback']);assert.equal(rollback.status,0,rollback.stderr);assert.equal(JSON.parse(rollback.stdout).status,'rolled_back');assert.equal(readFileSync(path.join(root,'.lumine/project.json'),'utf8'),config);
 }finally{rmSync(root,{recursive:true,force:true});}
});
