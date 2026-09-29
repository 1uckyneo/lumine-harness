import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync, existsSync, readdirSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { request } from 'node:http';
import { applyUpdate, checkWiki, prepareUpdate, queryKnowledge, scanWiki, showKnowledge } from '../wiki/engine.ts';
import { sourcePath, wikiConfig } from '../wiki/files.ts';
import { parseDocument } from '../wiki/documents.ts';
import { threeWayMerge } from '../wiki/merge.ts';
import { serveWiki } from '../wiki/server.ts';

function fixture() {
  const root = mkdtempSync(path.join(os.tmpdir(), 'lumine-wiki-'));
  mkdirSync(path.join(root, '.lumine'), { recursive: true });
  mkdirSync(path.join(root, 'docs/repo-wiki'), { recursive: true });
  mkdirSync(path.join(root, 'src'), { recursive: true });
  writeFileSync(path.join(root, '.lumine/root.json'), JSON.stringify({ schemaVersion: 2, kind: 'lumine-root' }));
  writeFileSync(path.join(root, '.lumine/project.json'), JSON.stringify({ schemaVersion: 2, workflowVersion: 2, locale: 'zh-CN', repositories: [{id:'root',path:'.'}], wiki: {root:'docs/repo-wiki',watchScopes:[{repoId:'root',path:'src'}],maxCards:6,maxContextChars:12000} }));
  writeFileSync(path.join(root, 'src/login.ts'), 'export const login = () => "signed-in";\n');
  const markdown = `---\nid: login-flow\ntitle: 登录与会话\nsummary: 登录后的会话建立和退出边界。\ntype: architecture\nstatus: current\nlocale: zh-CN\naliases: [authentication, login, session]\nsources:\n  - id: login-source\n    repoId: root\n    path: src/login.ts\ndiagrams:\n  - id: login-sequence\n    title: 登录流程\n    caption: 用户提交后建立会话。\n    sources: [login-source]\n---\n\n# 登录与会话\n\n登录创建会话。\n\n\`\`\`mermaid\nsequenceDiagram\n  用户->>服务: 登录\n  服务-->>用户: 会话\n\`\`\`\n\n## 限制\n\n源码尚不证明部署行为。\n`;
  const file = path.join(root, 'docs/repo-wiki/登录与会话.md'); writeFileSync(file, markdown);
  return { root, file, markdown, close: () => rmSync(root, {recursive:true,force:true}) };
}
function establish(root: string, markdown: string): void { const packet=prepareUpdate(root); const result=applyUpdate(root, packet.id,[{id:'login-flow',markdown}]); assert.equal(result.results[0].status,'applied'); }

test('Chinese and English queries return the same stable text identity; cold cache is unnecessary',()=>{
  const data=fixture(); try {
    establish(data.root,data.markdown);
    assert.equal(queryKnowledge(data.root,'登录').cards[0].id,'login-flow');
    assert.equal(queryKnowledge(data.root,'authentication').cards[0].id,'login-flow');
    rmSync(path.join(data.root,'.lumine/local'),{recursive:true,force:true});
    assert.equal(showKnowledge(data.root,'登录与会话').freshness,'current');
    const response=JSON.stringify(queryKnowledge(data.root,'login'));
    assert.doesNotMatch(response,/<svg|data:image|base64|<img/);
    assert.equal(showKnowledge(data.root,'login-flow').diagrams[0].id,'login-sequence');
  }finally{data.close();}
});

test('a document without baseline is protected; overlapping human and generated edits stay durable',()=>{
  const data=fixture();try{
    let packet=prepareUpdate(data.root);
    assert.equal(applyUpdate(data.root,packet.id,[{id:'login-flow',markdown:data.markdown.replace('登录创建会话。','新生成的解释。')}]).results[0].status,'protected');
    establish(data.root,data.markdown);
    packet=prepareUpdate(data.root);
    writeFileSync(data.file,data.markdown.replace('登录创建会话。','人工确认的解释。'));
    const result=applyUpdate(data.root,packet.id,[{id:'login-flow',markdown:data.markdown.replace('登录创建会话。','生成器的新解释。')}]);
    assert.equal(result.results[0].status,'conflict');
    assert.match(readFileSync(data.file,'utf8'),/人工确认/);
    const candidate=result.results[0].candidatePath!;
    assert.match(readFileSync(path.join(data.root,candidate),'utf8'),/生成器的新解释/);
    rmSync(path.join(data.root,'.lumine/local'),{recursive:true,force:true});
    assert.equal(showKnowledge(data.root,'login-flow').freshness,'conflict');
  }finally{data.close();}
});

test('disjoint human edits are preserved by the generated baseline across repeated updates',()=>{
  const data=fixture();try{
    establish(data.root,data.markdown);
    const packet=prepareUpdate(data.root);
    writeFileSync(data.file,data.markdown.replace('源码尚不证明部署行为。','人工补充：请核实部署版本。'));
    const candidate=data.markdown.replace('登录创建会话。','登录建立可退出的会话。');
    assert.equal(applyUpdate(data.root,packet.id,[{id:'login-flow',markdown:candidate}]).results[0].status,'applied');
    assert.match(readFileSync(data.file,'utf8'),/人工补充/);
    const next=prepareUpdate(data.root);
    assert.equal(applyUpdate(data.root,next.id,[{id:'login-flow',markdown:candidate.replace('可退出','可恢复')}]).results[0].status,'applied');
    assert.match(readFileSync(data.file,'utf8'),/人工补充/);
  }finally{data.close();}
});

test('new unreferenced files and dirty content invalidate freshness and prepared work',()=>{
  const data=fixture();try{
    establish(data.root,data.markdown);
    const packet=prepareUpdate(data.root);
    writeFileSync(path.join(data.root,'src/new-service.ts'),'export const added = true;');
    const scan=scanWiki(data.root);
    assert.equal(scan.documents[0].freshness,'stale');
    assert.ok(scan.unclassifiedFiles.includes('root:src/new-service.ts'));
    assert.equal(applyUpdate(data.root,packet.id,[{id:'login-flow',markdown:data.markdown}]).results[0].status,'source-drift');
    rmSync(path.join(data.root,'src/login.ts'));
    const result=scanWiki(data.root);
    assert.ok(result.documents[0].removedFiles.includes('root:src/login.ts'));
  }finally{data.close();}
});

test('source registration, exclusions, traversal and symlink boundaries are enforced',()=>{
  const data=fixture(),outside=mkdtempSync(path.join(os.tmpdir(),'lumine-wiki-outside-'));try{
    writeFileSync(path.join(outside,'private.txt'),'private');
    symlinkSync(path.join(outside,'private.txt'),path.join(data.root,'src/escape.ts'));
    const config=wikiConfig(data.root);
    assert.throws(()=>sourcePath(data.root,config,'unknown','src/login.ts'),/NOT_REGISTERED/);
    assert.throws(()=>sourcePath(data.root,config,'root','../private.txt'),/NOT_RELATIVE/);
    assert.throws(()=>sourcePath(data.root,config,'root','src/escape.ts'),/OUTSIDE_ROOT/);
    assert.throws(()=>sourcePath(data.root,config,'root','.env.local'),/EXCLUDED/);
    assert.throws(()=>sourcePath(data.root,config,'root','.lumine/wiki-state/private.json'),/EXCLUDED/);
  }finally{data.close();rmSync(outside,{recursive:true,force:true});}
});

test('diagram validation is text-only and does not equate structure checks with semantic acceptance',()=>{
  const data=fixture();try{
    const parsed=parseDocument(data.markdown.replace('sequenceDiagram','%%{init: {"securityLevel":"loose"}}%%\nsequenceDiagram'),'docs/repo-wiki/登录与会话.md');
    assert.ok(parsed.issues.some((issue)=>issue.startsWith('DIAGRAM_UNSAFE')));
    const check=checkWiki(data.root);
    assert.equal(check.status,'passed');
    assert.ok(check.notVerified.includes('semantic accuracy'));
    assert.ok(check.issues.some((issue)=>issue.code==='KNOWLEDGE_UNVERIFIED'));
    assert.throws(()=>parseDocument(data.markdown.replace('id: login-flow','id: ../../escape'),'x.md'),/ID_INVALID/);
  }finally{data.close();}
});

test('three-way merge rejects same-position competing insertions but merges distant changes',()=>{
  assert.deepEqual(threeWayMerge('a\nb\nc\nd','A\nb\nc\nd','a\nb\nc\nD'),{clean:true,content:'A\nb\nc\nD'});
  assert.equal(threeWayMerge('a\nb','a\nx\nb','a\ny\nb').clean,false);
});

test('reader serves text to allowed loopback origin and rejects writes, hostile origin and file paths',async()=>{
  const data=fixture();let reader:Awaited<ReturnType<typeof serveWiki>>|undefined;try{
    const assets=path.join(data.root,'test-reader');mkdirSync(assets);writeFileSync(path.join(assets,'index.html'),'<html>Reader</html>');
    reader=await serveWiki(data.root,{port:0,assetsRoot:assets});
    const fetchLocal=async(url:string,method='GET',headers:Record<string,string>={}):Promise<{status:number;text:string}>=>new Promise((resolve,reject)=>{const req=request(url,{method,headers},(response)=>{let text='';response.setEncoding('utf8');response.on('data',(chunk)=>{text+=chunk;});response.on('end',()=>resolve({status:response.statusCode!,text}));});req.on('error',reject);req.end();});
    const response=await fetchLocal(`${reader.url}/api/document?id=login-flow`);
    assert.equal(response.status,200);assert.match(response.text,/登录/);assert.doesNotMatch(response.text,/data:image|<svg/);
    assert.equal((await fetchLocal(`${reader.url}/api/catalog`,'POST')).status,405);
    assert.equal((await fetchLocal(`${reader.url}/api/catalog`,'GET',{Origin:'https://evil.example'})).status,403);
    assert.equal((await fetchLocal(`${reader.url}/api/catalog`,'GET',{Host:'evil.example'})).status,403);
    assert.equal((await fetchLocal(`${reader.url}/api/source?document=login-flow&id=unknown`)).status,404);
    assert.notEqual((await fetchLocal(`${reader.url}/.lumine/project.json`)).status,200);
    const source=await fetchLocal(`${reader.url}/api/source?document=login-flow&id=login-source`);assert.equal(source.status,200);assert.doesNotMatch(source.text,new RegExp(data.root));
  }finally{await reader?.close();data.close();}
});

test('updates only create text files and preserve image-free knowledge assets',()=>{
  const data=fixture();try{
    establish(data.root,data.markdown);
    const files:string[]=[];const visit=(folder:string):void=>{for(const entry of readdirSync(folder,{withFileTypes:true})){const file=path.join(folder,entry.name);if(entry.isDirectory())visit(file);else files.push(file);}};visit(data.root);
    assert.equal(files.filter((file)=>/\.(png|jpe?g|webp|svg)$/i.test(file)).length,0);
    assert.equal(existsSync(path.join(data.root,'.lumine/wiki-state/documents')),true);
  }finally{data.close();}
});

test('Git ignored files, nested repositories and migration backups do not enter parent snapshots',()=>{
  const data=fixture();try{
    mkdirSync(path.join(data.root,'child/src'),{recursive:true});writeFileSync(path.join(data.root,'child/src/api.ts'),'export const child=true;');
    writeFileSync(path.join(data.root,'.gitignore'),'private/\nsrc/hidden.ts\n');mkdirSync(path.join(data.root,'private'));writeFileSync(path.join(data.root,'private/data.txt'),'private');writeFileSync(path.join(data.root,'src/hidden.ts'),'private');
    mkdirSync(path.join(data.root,'.lumine-migrations'));writeFileSync(path.join(data.root,'.lumine-migrations/backup.txt'),'private');
    const config=JSON.parse(readFileSync(path.join(data.root,'.lumine/project.json'),'utf8'));config.repositories.push({id:'child',path:'child'});config.wiki.watchScopes=[{repoId:'root',path:'.'},{repoId:'child',path:'src'}];writeFileSync(path.join(data.root,'.lumine/project.json'),JSON.stringify(config));
    assert.throws(()=>sourcePath(data.root,wikiConfig(data.root),'root','src/hidden.ts'),/GITIGNORED/);
    assert.throws(()=>sourcePath(data.root,wikiConfig(data.root),'root','child/src/api.ts'),/OTHER_REPOSITORY/);
    const scan=scanWiki(data.root);
    assert.ok(scan.unclassifiedFiles.includes('child:src/api.ts'));
    assert.ok(!scan.unclassifiedFiles.includes('root:child/src/api.ts'));
    assert.ok(!scan.unclassifiedFiles.some((item)=>/hidden|private|migrations/.test(item)));
  }finally{data.close();}
});

test('deferred and keep-current decisions persist without deleting candidate evidence',async()=>{
  const {recordUpdateDecision}=await import('../wiki/engine.ts');
  const data=fixture();try{
    const packet=prepareUpdate(data.root);
    const result=applyUpdate(data.root,packet.id,[{id:'login-flow',markdown:data.markdown.replace('登录创建会话。','未经审阅的新解释。')}]);
    recordUpdateDecision(data.root,packet.id,'login-flow','defer','等待来源核实');
    assert.equal(showKnowledge(data.root,'login-flow').freshness,'conflict');
    recordUpdateDecision(data.root,packet.id,'login-flow','keep-current','已审阅：保留人工正文');
    assert.equal(showKnowledge(data.root,'login-flow').freshness,'unverified');
    assert.equal(existsSync(path.join(data.root,result.results[0].candidatePath!)),true);
  }finally{data.close();}
});

test('a pending document-write transaction restores its baseline and refuses later human drift',async()=>{
  const {hash,writeJson}=await import('../wiki/files.ts');
  const {baselineFor}=await import('../wiki/documents.ts');
  const {recoverWiki}=await import('../wiki/engine.ts');
  const data=fixture();try{
    establish(data.root,data.markdown);
    const previous=baselineFor(data.root,'login-flow')!;
    const content=data.markdown.replace('登录创建会话。','登录建立会话。');
    const baseline={...previous,generation:previous.generation+1,generatedMarkdown:content,appliedRevision:hash(content)};
    const journal=path.join(data.root,'.lumine/wiki-state/transactions/interrupted.json');
    writeJson(journal,{id:'interrupted',status:'pending',path:'docs/repo-wiki/登录与会话.md',previousRevision:hash(data.markdown),content,baseline,previousBaseline:previous});
    writeFileSync(data.file,content);
    assert.deepEqual(recoverWiki(data.root).recovered,['interrupted']);
    assert.equal(baselineFor(data.root,'login-flow')?.appliedRevision,hash(content));
    writeJson(journal,{id:'interrupted',status:'pending',path:'docs/repo-wiki/登录与会话.md',previousRevision:hash(data.markdown),content,baseline,previousBaseline:previous});
    writeFileSync(data.file,content+'\n人工修改\n');
    assert.throws(()=>recoverWiki(data.root),/DOCUMENT_CONFLICT/);
    assert.match(readFileSync(data.file,'utf8'),/人工修改/);
  }finally{data.close();}
});

test('explicit per-topic watch scopes avoid invalidating unrelated knowledge',()=>{
  const data=fixture();try{
    const content=data.markdown.replace('aliases: [authentication, login, session]','aliases: [authentication, login, session]\nwatchScopes: [{repoId: root, path: src/login.ts}]');writeFileSync(data.file,content);
    establish(data.root,content);
    writeFileSync(path.join(data.root,'src/unrelated.ts'),'export const other=true;');
    assert.equal(showKnowledge(data.root,'login-flow').freshness,'current');
    assert.ok(scanWiki(data.root).unclassifiedFiles.includes('root:src/unrelated.ts'));
  }finally{data.close();}
});


test('diagram captions, relations and Mermaid labels participate in text retrieval',()=>{
  const data=fixture();try{
    const markdown=data.markdown.replace('caption: 用户提交后建立会话。','caption: 稀有词量子绿洲只出现于读图说明。').replace('aliases: [authentication, login, session]','aliases: [authentication, login, session]\nrelations: [related-unique-reference]');
    writeFileSync(data.file,markdown);
    assert.equal(queryKnowledge(data.root,'量子绿洲').cards[0].id,'login-flow');
    assert.equal(queryKnowledge(data.root,'related-unique-reference').cards[0].id,'login-flow');
    assert.throws(()=>queryKnowledge(data.root,'login',{limit:NaN}),/QUERY_BUDGET_INVALID/);
    assert.throws(()=>queryKnowledge(data.root,'login',{maxChars:-1}),/QUERY_BUDGET_INVALID/);
  }finally{data.close();}
});


test('historical documents remain directly readable but are excluded from default catalog and queries',()=>{
  const data=fixture();try{
    mkdirSync(path.join(data.root,'docs/product-specs'),{recursive:true});
    writeFileSync(path.join(data.root,'docs/product-specs/history.md'),'---\nid: historical-spec\ntitle: 历史产品方案\nstatus: historical\n---\n\n历史资料。\n');
    assert.equal(queryKnowledge(data.root,'历史',{collection:'spec'}).total,0);
    assert.equal(showKnowledge(data.root,'historical-spec').status,'historical');
    mkdirSync(path.join(data.root,'docs/exec-plans/completed'),{recursive:true});
    writeFileSync(path.join(data.root,'docs/exec-plans/completed/历史记录.md'),'# 已完成实施\n\n历史执行记录不需要当前元数据。\n');
    assert.equal(queryKnowledge(data.root,'历史',{collection:'plan'}).total,0);
    assert.equal(showKnowledge(data.root,'docs/exec-plans/completed/历史记录.md').title,'已完成实施');
    writeFileSync(data.file,data.markdown.replace('status: current','status: historical'));
    assert.equal(queryKnowledge(data.root,'登录').total,0);
    assert.equal(showKnowledge(data.root,'login-flow').status,'historical');
  }finally{data.close();}
});

test('reader resolves historical and validation Markdown references without serving arbitrary files',async()=>{
  const data=fixture(),outside=mkdtempSync(path.join(os.tmpdir(),'lumine-reference-outside-'));let reader:Awaited<ReturnType<typeof serveWiki>>|undefined;try{
    mkdirSync(path.join(data.root,'docs/exec-plans/completed'),{recursive:true});mkdirSync(path.join(data.root,'docs/validation'),{recursive:true});
    writeFileSync(path.join(data.root,'docs/exec-plans/completed/历史.md'),'---\nid: historical-plan\ntitle: 历史方案\nstatus: historical\n---\n\n历史证据。\n');
    writeFileSync(path.join(data.root,'docs/validation/验证 记录.md'),'# 验证结论\n\n已有操作通过，部署未验证。\n');
    writeFileSync(path.join(data.root,'docs/validation/trace.txt'),'attachment bytes are never served');
    writeFileSync(path.join(data.root,'docs/validation/private.md'),'private evidence');writeFileSync(path.join(data.root,'.gitignore'),'docs/validation/private.md\n');
    writeFileSync(path.join(outside,'sensitive.md'),'outside-sensitive');symlinkSync(path.join(outside,'sensitive.md'),path.join(data.root,'docs/validation/escape.md'));
    const assets=path.join(data.root,'reader');mkdirSync(assets);writeFileSync(path.join(assets,'index.html'),'reader');reader=await serveWiki(data.root,{port:0,assetsRoot:assets});
    const get=async(from:string,target:string):Promise<{status:number;body:Record<string,unknown>}>=>{const response=await fetch(`${reader!.url}/api/reference?${new URLSearchParams({from,target})}`);return {status:response.status,body:await response.json() as Record<string,unknown>};};
    const history=await get('login-flow','../exec-plans/completed/历史.md#选择');assert.equal(history.status,200);assert.equal(history.body.kind,'document');assert.equal(history.body.id,'historical-plan');assert.equal(history.body.fragment,'选择');
    const validation=await get('login-flow','../validation/验证%20记录.md');assert.equal(validation.status,200);assert.equal(validation.body.kind,'markdown');assert.match(String(validation.body.markdown),/部署未验证/);
    const attachment=await get('docs/validation/验证 记录.md','trace.txt');assert.equal(attachment.status,200);assert.deepEqual(attachment.body,{kind:'attachment',path:'docs/validation/trace.txt'});
    for(const target of ['../validation/private.md','../validation/escape.md','../../.lumine/project.json','../../src/login.ts','https://evil.example/doc.md','../validation/%2e%2e/%2e%2e/.lumine/project.json']){
      const result=await get('login-flow',target);assert.notEqual(result.status,200,target);assert.doesNotMatch(JSON.stringify(result.body),/outside-sensitive|private evidence|attachment bytes/);
    }
    assert.notEqual((await get('unknown','../validation/验证%20记录.md')).status,200);
    const catalog=await (await fetch(`${reader.url}/api/catalog`)).json() as {documents:{id:string}[]};assert.ok(!catalog.documents.some(document=>document.id==='historical-plan'));
  }finally{await reader?.close();data.close();rmSync(outside,{recursive:true,force:true});}
});
