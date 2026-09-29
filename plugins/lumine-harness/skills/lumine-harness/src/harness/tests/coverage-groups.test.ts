import test from 'node:test';
import assert from 'node:assert/strict';
import { validateCoverage } from '../wiki/coverage.ts';
const node = (id:string, parentId?:string, documentRefs:string[] = [], status = 'covered') => ({id,title:id,...(parentId ? {parentId} : {}),questions:['Which mechanism?'],sourceScopes:[],documentRefs,status});
test('a completed grouping topic uses child pages without copying a parent document', () => {
 const topics=[node('root'),node('nested','root'),node('leaf','nested',['mechanism'])];
 assert.equal(validateCoverage({schemaVersion:1,topics}).topics.length,3);
});
test('empty leaves and groups with unfinished children cannot claim coverage', () => {
 assert.throws(()=>validateCoverage({schemaVersion:1,topics:[node('empty')]}),/COVERAGE_COVERED_WITHOUT_DOCUMENT/);
 assert.throws(()=>validateCoverage({schemaVersion:1,topics:[node('root'),node('leaf','root',[],'planned')]}),/COVERAGE_GROUP_INCOMPLETE/);
 assert.throws(()=>validateCoverage({schemaVersion:1,topics:[node('a','b'),node('b','a')]}),/COVERAGE_CYCLE/);
});

test('a page has one primary place even when another topic selects a different fragment', () => {
 assert.throws(()=>validateCoverage({schemaVersion:1,topics:[node('one',undefined,['page#first']),node('two',undefined,['page#second'])]}),/COVERAGE_DOCUMENT_DUPLICATE/);
 assert.throws(()=>validateCoverage({schemaVersion:1,topics:[node('one',undefined,['page','page'])]}),/COVERAGE_DOCUMENT_DUPLICATE/);
});
