import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,writeFileSync,readFileSync,rmSync} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {loadProjectConfig} from '../core/project-config.ts';
import {createProposal} from '../../scripts/harness-manager.ts';

test('storage version fence remains distinct from workflow version and reads do not rewrite config',()=>{
 const root=mkdtempSync(path.join(os.tmpdir(),'lumine-storage-version-'));
 try {
  mkdirSync(path.join(root,'.lumine'));const file=path.join(root,'.lumine/project.json');
  for(const schemaVersion of [2,3,4]){const bytes=JSON.stringify({schemaVersion,workflowVersion:2,locale:'zh-CN'});writeFileSync(file,bytes);const c=loadProjectConfig(root);assert.equal(c.schemaVersion,schemaVersion);assert.equal(c.workflowVersion,2);assert.equal(readFileSync(file,'utf8'),bytes);}
  for(const schemaVersion of [1,5,'3']){writeFileSync(file,JSON.stringify({schemaVersion}));assert.throws(()=>loadProjectConfig(root),/Unsupported project schemaVersion/);}
 } finally {rmSync(root,{recursive:true,force:true});}
});

test('an upgrade preserves the compacted project version fence and rejects downgrade overrides',()=>{
 const root=mkdtempSync(path.join(os.tmpdir(),'lumine-storage-upgrade-'));
 try{
  mkdirSync(path.join(root,'.lumine'));
  for (const schemaVersion of [3, 4]) {
    writeFileSync(path.join(root,'.lumine/project.json'),JSON.stringify({schemaVersion,workflowVersion:2,locale:'zh-CN',repositories:[{id:'project',path:'.'}]}));
    const proposal=createProposal(root,{adapters:'none',locale:'zh-CN'});assert.equal(proposal.project.schemaVersion,schemaVersion);assert.equal(proposal.project.workflowVersion,2);
    assert.throws(()=>createProposal(root,{adapters:'none',locale:'zh-CN',overrides:{'.lumine/project.json':Buffer.from(JSON.stringify({schemaVersion:schemaVersion - 1,locale:'zh-CN'})).toString('base64')}}),/version/);
  }
 }finally{rmSync(root,{recursive:true,force:true});}
});
