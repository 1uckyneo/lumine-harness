import { marked } from 'marked';
import DOMPurify from 'dompurify';
import type { Diagram, KnowledgeDocument, Locale } from '../harness/wiki/types.ts';

type CatalogDocument = Omit<KnowledgeDocument, 'markdown' | 'body' | 'diagrams'> & { diagrams: Omit<Diagram, 'code'>[] };
const words = {
  'zh-CN': { knowledge:'仓库知识',spec:'产品方案',plan:'执行计划',library:'知识目录',intro:'理解系统，找到依据',subtitle:'从架构和业务机制出发，阅读有来源的工程知识。',search:'搜索主题、机制或代码标识符…',allRepos:'全部仓库',allTypes:'全部类型',allStates:'全部时效',current:'已核实',stale:'待更新',unverified:'待核实','missing-source':'来源缺失',conflict:'待处理冲突',grid:'卡片',list:'列表',sources:'来源依据',related:'关联知识',contents:'本页目录',noResults:'没有找到相关内容。试试其他关键词或筛选条件。',empty:'这里还没有文档。通过 Agent 创建产品方案或知识主题后即可阅读。',retry:'重新载入',loadError:'内容未能载入，请检查阅读服务后重试。',back:'返回目录',copyRef:'复制引用',edit:'复制编辑指令',download:'导出 Markdown',copied:'已复制',copyFailed:'无法写入剪贴板，请从文本窗口复制。',diagram:'图解',enlarge:'放大查看',source:'查看文本',close:'关闭',zoomIn:'放大',zoomOut:'缩小',fit:'适合窗口',reset:'重置',exportSVG:'导出 SVG',exportText:'导出 Mermaid',diagramError:'图解暂时无法显示。文字说明和 Mermaid 源码仍可阅读。',loading:'正在载入…',labels:'图解文本',readonly:'本地只读 · 文本知识',status:'状态',revision:'内容版本',sourceLimit:'源码只能说明相应版本的实现，不能单独证明部署或实际运行。',pending:'当前内容仍需核实，引用前请查看来源与适用范围。',proposed:'拟议方案',historical:'历史记录',sourceMissing:'来源暂时不可用，可能尚未取得对应仓库。',found:'个主题',menu:'打开目录',collapse:'收起预览',preview:'查看图解',refresh:'刷新',sourceKind:'依据类型',referenceError:'这份资料暂时无法在阅读器中打开，请核对原路径和访问范围。',attachment:'此附件不在阅读器内预览，请按以下项目相对路径查看原文件。',referenceText:'查看 Markdown',referenceExport:'导出 Markdown' },
  en: { knowledge:'Repo Wiki',spec:'Product specs',plan:'Execution plans',library:'Library',intro:'Understand the system. Trace the evidence.',subtitle:'Explore architecture and product mechanisms through source-backed engineering knowledge.',search:'Search topics, mechanisms or code identifiers…',allRepos:'All repositories',allTypes:'All types',allStates:'All freshness',current:'Verified',stale:'Needs update',unverified:'Unverified','missing-source':'Source missing',conflict:'Conflict',grid:'Cards',list:'List',sources:'Sources',related:'Related knowledge',contents:'On this page',noResults:'No matching content. Try another term or remove a filter.',empty:'No documents here yet. Ask your agent to create a product spec or a knowledge topic.',retry:'Try again',loadError:'Content could not be loaded. Check the reader service and try again.',back:'Back to library',copyRef:'Copy reference',edit:'Copy edit prompt',download:'Export Markdown',copied:'Copied',copyFailed:'Clipboard is unavailable. Copy from the text window instead.',diagram:'Diagrams',enlarge:'Open diagram',source:'View text',close:'Close',zoomIn:'Zoom in',zoomOut:'Zoom out',fit:'Fit',reset:'Reset',exportSVG:'Export SVG',exportText:'Export Mermaid',diagramError:'This diagram could not be displayed. Its explanation and Mermaid text are still available.',loading:'Loading…',labels:'Diagram text',readonly:'Local · Read only · Text knowledge',status:'Status',revision:'Revision',sourceLimit:'Source code describes an implementation version; it does not establish deployment or runtime behavior.',pending:'Review the sources and scope before relying on this content.',proposed:'Proposed',historical:'Historical',sourceMissing:'The source is unavailable. Its repository may not be present yet.',found:'topics',menu:'Open navigation',collapse:'Hide preview',preview:'Preview diagram',refresh:'Refresh',sourceKind:'Evidence type',referenceError:'This reference could not be opened. Check its original path and access scope.',attachment:'This attachment is not previewed in the reader. Open the original file at this project-relative path.',referenceText:'View Markdown',referenceExport:'Export Markdown' }
} as const;
let locale: Locale = 'en', catalog: CatalogDocument[] = [], current: KnowledgeDocument | null = null, collection = 'wiki', view = 'grid', requestVersion = 0, sourceRequest = 0;
const app = document.querySelector<HTMLDivElement>('#app')!;
const dialog = document.querySelector<HTMLDialogElement>('#diagram-dialog')!;
const textDialog = document.querySelector<HTMLDialogElement>('#text-dialog')!;
const state = { query:'', repo:'', type:'', freshness:'' };
const t = (key: string): string => words[locale][key as keyof typeof words.en] ?? key;
const escape = (value: unknown): string => String(value ?? '').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&#39;');
const $ = <T extends HTMLElement>(selector: string): T => document.querySelector<T>(selector)!;
const toast = (message: string): void => { const target = $('#toast'); target.textContent = message; target.classList.add('visible'); window.setTimeout(() => target.classList.remove('visible'),3000); };
async function api<T>(endpoint: string): Promise<T> { const response = await fetch(endpoint,{ cache:'no-store' }); if (!response.ok) throw new Error((await response.json()).code ?? 'REQUEST_FAILED'); return response.json() as Promise<T>; }
function showText(title: string, content: string, meta = ''): void { textDialog.innerHTML = `<div class="dialog-header"><h2 id="text-title">${escape(title)}</h2><button data-action="close-text">${t('close')}</button></div><pre class="text-content" tabindex="0"></pre><p class="text-meta">${escape(meta)}</p>`; textDialog.querySelector('pre')!.textContent = content; textDialog.showModal(); }
async function copy(value: string): Promise<void> { try { await navigator.clipboard.writeText(value); toast(t('copied')); } catch { toast(t('copyFailed')); showText(t('source'),value); } }
function download(name: string, text: string, mime = 'text/plain;charset=utf-8'): void { const url = URL.createObjectURL(new Blob([text],{ type:mime })), link = document.createElement('a'); link.href=url; link.download=name.replace(/[<>:"/\\|?*\x00-\x1f]/g,'-'); link.click(); setTimeout(() => URL.revokeObjectURL(url),1000); }
type ReferenceResult = { kind:'document'|'markdown'|'attachment'; id?:string; path:string; markdown?:string; title?:string; revision?:string; fragment?:string };
let referenceText: { title:string; markdown:string } | null = null;
function safeMarkup(markdown: string): string {
  const linkedImages=markdown.replace(/!\[([^\]]*)\]\(([^)]+)\)/g,'[$1]($2)');
  return DOMPurify.sanitize(marked.parse(linkedImages,{async:false}) as string,{FORBID_TAGS:['img','iframe','object','embed','style','script','video','audio','form'],FORBID_ATTR:['style','srcset'],ALLOW_DATA_ATTR:false});
}
function prepareLinks(container: Element, fromPath: string): void {
  for(const anchor of container.querySelectorAll('a')){
    const href=anchor.getAttribute('href')??'';if(!href||href.startsWith('#'))continue;
    if(/^https?:\/\//.test(href)){anchor.target='_blank';anchor.rel='noopener noreferrer';continue;}
    const target=new URL(href,new URL(fromPath,location.origin+'/'));
    if(target.origin!==location.origin){anchor.removeAttribute('href');continue;}
    const match=catalog.find((doc)=>decodeURIComponent(target.pathname).slice(1)===doc.path);
    if(match){anchor.href=`?doc=${encodeURIComponent(match.id)}${target.hash}`;anchor.dataset.doc=match.id;anchor.dataset.fragment=decodeURIComponent(target.hash.slice(1));}
    else{anchor.href='#';anchor.dataset.reference=href;anchor.dataset.referenceFrom=fromPath;}
  }
}
function showMarkdownReference(result: ReferenceResult): void {
  referenceText={title:result.title??result.path,markdown:result.markdown??''};
  textDialog.innerHTML=`<div class="dialog-header"><h2 id="text-title">${escape(referenceText.title)}</h2><button data-action="close-text">${t('close')}</button></div><p class="text-meta">${escape(result.path)} · ${escape(result.revision?.slice(0,12))}</p><div class="dialog-tools"><button data-action="reference-source">${t('referenceText')}</button><button data-action="reference-export">${t('referenceExport')}</button></div><article class="reference-content prose"></article>`;
  const content=textDialog.querySelector('.reference-content')!;content.innerHTML=safeMarkup(referenceText.markdown.replace(/^---\r?\n[\s\S]*?\r?\n---(?:\r?\n|$)/,''));prepareLinks(content,result.path);
  for(const heading of content.querySelectorAll('h1,h2,h3,h4'))if(!heading.id)heading.id=(heading.textContent??'').trim().toLocaleLowerCase().replace(/[^\p{L}\p{N}_ -]/gu,'').replace(/\s+/g,'-');
  textDialog.showModal();if(result.fragment)[...content.querySelectorAll('[id]')].find((element)=>element.id===result.fragment)?.scrollIntoView();
}
function typeLabel(type: string): string {
  const labels: Record<string, [string, string]> = { architecture:['系统架构','Architecture'], mechanism:['实现机制','Mechanism'], 'product-spec':['产品方案','Product spec'], 'exec-plan':['执行计划','Execution plan'], business:['业务机制','Business flow'], 'business-flow':['业务流程','Business flow'], solution:['技术方案','Technical solution'], 'technical-solution':['技术方案','Technical solution'], convention:['工程约定','Convention'], stack:['技术栈','Technology'], spec:['产品方案','Product spec'], plan:['执行计划','Execution plan'] };
  return labels[type]?.[locale === 'zh-CN' ? 0 : 1] ?? type;
}
function collectionTitle(): string { return t(collection === 'wiki' ? 'knowledge' : collection); }
function shell(): void {
  document.documentElement.lang = locale;
  app.innerHTML = `<div class="shell"><aside class="sidebar"><button class="mobile-close" data-action="menu-close">${t('close')} ×</button><a class="brand" href="/"><span class="brand-mark">L</span><span><strong>Lumine</strong><small>${locale==='zh-CN'?'仓库知识库':'Repository Library'}</small></span></a><div><div class="nav-label">${t('library')}</div><nav class="nav">${['wiki','spec','plan'].map((item)=>`<button data-collection="${item}" class="${collection===item?'active':''}">${t(item==='wiki'?'knowledge':item)}<span>${catalog.filter((doc)=>doc.collection===item).length}</span></button>`).join('')}</nav></div><div class="sidebar-foot">${t('readonly')}<br>Markdown · Mermaid</div></aside><div class="main"><header class="topbar"><button class="mobile-menu" data-action="menu" aria-label="${t('menu')}">☰</button><div class="breadcrumb">Lumine / ${collectionTitle()}${current?` / ${escape(current.title)}`:''}</div><div class="top-actions"><button data-action="refresh">${t('refresh')}</button><button data-action="locale" aria-label="Language">${locale==='en'?'中文':'English'}</button></div></header><main class="workspace" id="workspace"></main></div></div>`;
}
function filterOptions(values: string[], selected: string, translate = false): string { return [...new Set(values)].sort().map((value)=>`<option value="${escape(value)}" ${selected===value?'selected':''}>${escape(translate?typeLabel(value):value)}</option>`).join(''); }
async function library(): Promise<void> {
  current = null; shell();
  $('#workspace').innerHTML = `<section class="intro"><div class="eyebrow">${collectionTitle()}</div><h1>${collection==='wiki'?t('intro'):collectionTitle()}</h1><p>${t('subtitle')}</p></section><div class="toolbar"><label class="search"><input id="query" type="search" value="${escape(state.query)}" placeholder="${t('search')}" aria-label="${t('search')}"></label><select id="repo-filter" aria-label="${t('allRepos')}"><option value="">${t('allRepos')}</option>${filterOptions(catalog.flatMap((doc)=>doc.repositories),state.repo)}</select><select id="type-filter" aria-label="${t('allTypes')}"><option value="">${t('allTypes')}</option>${filterOptions(catalog.filter((doc)=>doc.collection===collection).map((doc)=>doc.type),state.type,true)}</select><select id="freshness-filter" aria-label="${t('allStates')}"><option value="">${t('allStates')}</option>${['current','stale','unverified','missing-source','conflict'].map((value)=>`<option value="${value}" ${state.freshness===value?'selected':''}>${t(value)}</option>`).join('')}</select><div class="view-toggle"><button data-view="grid" aria-pressed="${view==='grid'}">${t('grid')}</button><button data-view="list" aria-pressed="${view==='list'}">${t('list')}</button></div></div><div class="result-count" id="result-count"></div><div id="cards" class="cards ${view==='list'?'list':''}" aria-live="polite"></div>`;
  let timeout = 0;
  $('#query').addEventListener('input',(event)=>{ state.query=(event.target as HTMLInputElement).value; clearTimeout(timeout); timeout=window.setTimeout(()=>void results(),180); });
  for (const [selector,key] of [['#repo-filter','repo'],['#type-filter','type'],['#freshness-filter','freshness']] as const) $(selector).addEventListener('change',(event)=>{state[key]=(event.target as HTMLSelectElement).value; void results();});
  await results();
}
async function results(): Promise<void> {
  const version = ++requestVersion;
  try {
    let documents = catalog.filter((doc)=>doc.collection===collection && (!state.repo||doc.repositories.includes(state.repo)) && (!state.type||doc.type===state.type) && (!state.freshness||doc.freshness===state.freshness));
    if (state.query.trim()) {
      const params = new URLSearchParams({q:state.query,collection,limit:'30',repo:state.repo,type:state.type,freshness:state.freshness});
      const found = await api<{cards:{id:string}[];total:number}>(`/api/query?${params}`);
      const order = new Map(found.cards.map((entry,index)=>[entry.id,index])); documents=documents.filter((doc)=>order.has(doc.id)).sort((a,b)=>order.get(a.id)!-order.get(b.id)!);
    }
    if(version!==requestVersion || current) return;
    $('#result-count').innerHTML = `<span>${documents.length} ${t('found')}</span><span>Markdown · Mermaid</span>`;
    $('#cards').className=`cards ${view==='list'?'list':''}`;
    $('#cards').innerHTML=documents.length?documents.map((doc)=>`<article class="card"><div class="card-head"><span class="type">${escape(typeLabel(doc.type))}</span><span class="freshness ${escape(doc.freshness)}"><i class="dot"></i>${t(doc.freshness)}</span></div><h2><a href="?doc=${encodeURIComponent(doc.id)}" data-doc="${escape(doc.id)}">${escape(doc.title)}</a></h2><p>${escape(doc.summary)}</p><div class="card-bottom"><span>${escape(doc.repositories.join(' · '))}</span>${doc.diagrams.length?`<button data-preview="${escape(doc.id)}">${doc.diagrams.length} ${t('diagram')} ↗</button>`:''}</div></article>`).join(''):`<div class="empty">${catalog.length?t('noResults'):t('empty')}</div>`;
  } catch { if(version===requestVersion && !current) $('#cards').innerHTML=`<div class="error">${t('loadError')} <button data-action="retry-search">${t('retry')}</button></div>`; }
}
async function openDocument(id: string, updateHistory = true, fragment = ''): Promise<void> {
  const version = ++requestVersion; shell(); $('#workspace').innerHTML=`<p role="status">${t('loading')}</p>`;
  try {
    const loaded = await api<KnowledgeDocument>(`/api/document?id=${encodeURIComponent(id)}`);
    if(version!==requestVersion) return;
    current=loaded; collection=loaded.collection;
    if(updateHistory) history.pushState({},'',`?doc=${encodeURIComponent(id)}${fragment?`#${encodeURIComponent(fragment)}`:''}`);
    shell();
    $('#workspace').innerHTML=`<div class="document-layout"><article class="document"><button data-action="back">← ${t('back')}</button><header class="doc-header"><div class="eyebrow">${escape(typeLabel(loaded.type))} · <span class="freshness ${escape(loaded.freshness)}">${t(loaded.freshness)}</span>${['proposed','historical'].includes(loaded.status)?` · ${t(loaded.status)}`:''}</div><h1>${escape(loaded.title)}</h1><p class="summary">${escape(loaded.summary)}</p><div class="doc-actions"><button data-action="copy-doc">${t('copyRef')}</button><button data-action="edit-doc">${t('edit')}</button><button data-action="export-doc">${t('download')}</button></div>${loaded.freshness!=='current'?`<div class="warning">${t('pending')}</div>`:''}</header><div class="prose" id="prose"></div></article><aside class="doc-aside"><section class="aside-section toc"><h2>${t('contents')}</h2><div id="toc"></div></section><section class="aside-section"><h2>${t('sources')} · ${loaded.sources.length}</h2>${loaded.sources.map((source)=>`<button class="source-button" data-source="${escape(source.id)}">${escape(source.repoId)} / ${escape(source.path)}<small>${escape(source.note??(locale==='zh-CN'?({source:'源码',runtime:'运行记录',decision:'决策记录'}[source.kind??'source']):source.kind??'Source'))}</small></button>`).join('')}<p>${t('sourceLimit')}</p></section><section class="aside-section"><h2>${t('related')}</h2>${loaded.relations.map((relation)=>`<a href="?doc=${encodeURIComponent(relation)}" data-doc="${escape(relation)}">${escape(catalog.find((doc)=>doc.id===relation)?.title??relation)}</a>`).join('')}</section><section class="aside-section"><h2>${t('revision')}</h2><code>${escape(loaded.revision.slice(0,12))}</code></section></aside></div>`;
    const prose=$('#prose');prose.innerHTML=safeMarkup(loaded.body);prepareLinks(prose,loaded.path);
    const headings=[...prose.querySelectorAll('h1,h2,h3')];
    if(headings[0]?.tagName==='H1' && headings[0].textContent===loaded.title) headings.shift()?.remove();
    const headingIds = new Set<string>();
    headings.forEach((heading,index)=>{
      const previous=heading.previousElementSibling;
      const explicit=previous?.tagName==='A' ? previous.id : previous?.querySelector('a[id]')?.id;
      let id=explicit||heading.id||(heading.textContent??'').trim().toLocaleLowerCase().replace(/[^\p{L}\p{N}_ -]/gu,'').replace(/\s+/g,'-')||`section-${index+1}`;
      if(headingIds.has(id))id=`${id}-${index+1}`;
      if(explicit&&previous){if(previous.id===explicit)previous.removeAttribute('id');previous.querySelector('a[id]')?.removeAttribute('id');}
      heading.id=id;headingIds.add(id);
    });
    $('#toc').innerHTML=headings.map((heading)=>`<a href="#${encodeURIComponent(heading.id)}">${escape(heading.textContent)}</a>`).join('');
    let diagramIndex=0;
    for(const code of prose.querySelectorAll('pre>code.language-mermaid')) {
      const diagram=loaded.diagrams[diagramIndex++]; if(!diagram) continue;
      const figure=document.createElement('figure'); figure.className='diagram';figure.id=diagram.id;
      figure.innerHTML=`<div class="diagram-header"><span>${escape(diagram.title)}</span><div class="diagram-tools"><button data-enlarge="${escape(diagram.id)}">${t('enlarge')}</button><button data-diagram-source="${escape(diagram.id)}">${t('source')}</button></div></div><div class="diagram-canvas" role="img" aria-label="${escape(diagram.title)}"></div><p class="diagram-caption">${escape(diagram.caption)}</p><div class="diagram-sources">${diagram.sources.map((sourceId)=>`<button data-source="${escape(sourceId)}">${t('sources')} · ${escape(sourceId)}</button>`).join('')}</div><details><summary>${t('labels')}</summary><pre><code></code></pre></details>`;
      figure.querySelector('code')!.textContent=diagram.code;
      code.parentElement!.replaceWith(figure);
      lazyDiagram(figure.querySelector('.diagram-canvas')!,diagram);
    }
    const targetFragment=fragment||decodeURIComponent(location.hash.slice(1));
    if(targetFragment) document.getElementById(targetFragment)?.scrollIntoView(); else window.scrollTo(0,Number(sessionStorage.getItem(`lumine:scroll:${id}`))||0);
    document.title=`${loaded.title} · Lumine`;
  } catch { if(version===requestVersion) $('#workspace').innerHTML=`<div class="error">${t('loadError')} <button data-doc="${escape(id)}">${t('retry')}</button></div>`; }
}
let mermaidPromise: Promise<typeof import('mermaid')> | null = null, renderCount=0;
async function draw(target: Element, diagram: Diagram): Promise<void> {
  if(target.querySelector('svg')) return;
  if(diagram.code.length>50000 || (diagram.code.match(/-->|--\)|==>|->>|-->>/g)?.length??0)>300 || /%%\{|^---\s*$|\bclick\s|<\/?(?:script|iframe)|javascript:|https?:\/\//mi.test(diagram.code)) { target.innerHTML=`<div class="diagram-error">${t('diagramError')}</div>`; return; }
  try {
    if(!mermaidPromise) mermaidPromise=import('mermaid').then((module)=>{module.default.initialize({startOnLoad:false,securityLevel:'strict',theme:'base',htmlLabels:false,flowchart:{htmlLabels:false},maxTextSize:50000,maxEdges:300,themeVariables:{primaryColor:'#e7eee3',primaryTextColor:'#253331',primaryBorderColor:'#83927b',lineColor:'#64806b',fontFamily:'sans-serif',secondaryColor:'#f3eedf',tertiaryColor:'#f6f5f0'}});return module;});
    const {default:mermaid}=await mermaidPromise;
    const {svg}=await mermaid.render(`lumine-diagram-${++renderCount}`,diagram.code,target);
    target.innerHTML=DOMPurify.sanitize(svg,{USE_PROFILES:{svg:true,svgFilters:true},FORBID_TAGS:['foreignObject','script','image'],FORBID_ATTR:['onload','onclick']});
    target.querySelector('svg')?.setAttribute('aria-label',diagram.title);
  } catch { target.innerHTML=`<div class="diagram-error">${t('diagramError')}</div>`; }
}
function lazyDiagram(target: Element, diagram: Diagram): void {
  target.textContent=t('loading');
  const observer=new IntersectionObserver((entries)=>{if(entries.some((entry)=>entry.isIntersecting)){observer.disconnect();void draw(target,diagram);}},{rootMargin:'120px'});observer.observe(target);
}
async function showDiagram(diagram: Diagram): Promise<void> {
  const scrollY=window.scrollY, doc=current;
  dialog.innerHTML=`<div class="dialog-header"><h2 id="diagram-title">${escape(diagram.title)}</h2><button data-action="close-diagram">${t('close')} ×</button></div><div class="dialog-tools"><button data-zoom="in">＋ ${t('zoomIn')}</button><button data-zoom="out">− ${t('zoomOut')}</button><button data-zoom="fit">${t('fit')}</button><button data-zoom="reset">${t('reset')}</button><button data-zoom="copy">${t('copyRef')}</button><button data-zoom="text">${t('source')}</button><button data-zoom="mermaid">${t('exportText')}</button><button data-zoom="svg">${t('exportSVG')}</button></div><div class="viewport" tabindex="0" role="region" aria-label="${escape(diagram.title)}"><div class="zoom-layer"></div></div>`;
  dialog.showModal();
  dialog.addEventListener('close',()=>window.scrollTo(0,scrollY),{once:true});
  const viewport=dialog.querySelector<HTMLElement>('.viewport')!,layer=dialog.querySelector<HTMLElement>('.zoom-layer')!;
  await draw(layer,diagram); const svg=layer.querySelector('svg'); if(!svg) return;
  const box=svg.viewBox.baseVal, width=box.width||900,height=box.height||500;
  layer.style.width=`${width}px`;layer.style.height=`${height}px`;
  let scale=1,x=0,y=0,start:{x:number;y:number;px:number;py:number}|null=null;
  const apply=():void=>{layer.style.transform=`translate(${x}px,${y}px) scale(${scale})`;};
  const fit=():void=>{scale=Math.max(.05,Math.min((viewport.clientWidth-50)/width,(viewport.clientHeight-50)/height,2));x=(viewport.clientWidth-width*scale)/2;y=(viewport.clientHeight-height*scale)/2;apply();};
  const zoom=(factor:number):void=>{const next=Math.min(8,Math.max(.05,scale*factor)),cx=viewport.clientWidth/2,cy=viewport.clientHeight/2;x=cx-(cx-x)*next/scale;y=cy-(cy-y)*next/scale;scale=next;apply();};
  fit();
  viewport.addEventListener('pointerdown',(event)=>{start={x,y,px:event.clientX,py:event.clientY};viewport.setPointerCapture(event.pointerId);});
  viewport.addEventListener('pointermove',(event)=>{if(start){x=start.x+event.clientX-start.px;y=start.y+event.clientY-start.py;apply();}});
  viewport.addEventListener('pointerup',()=>{start=null;});viewport.addEventListener('pointercancel',()=>{start=null;});
  viewport.addEventListener('wheel',(event)=>{event.preventDefault();zoom(event.deltaY>0?.9:1.1);},{passive:false});
  viewport.addEventListener('keydown',(event)=>{if(event.key==='+'||event.key==='=')zoom(1.2);else if(event.key==='-')zoom(.8);else if(event.key==='0')fit();else if(event.key.startsWith('Arrow')){event.preventDefault();x+=event.key==='ArrowLeft'?25:event.key==='ArrowRight'?-25:0;y+=event.key==='ArrowUp'?25:event.key==='ArrowDown'?-25:0;apply();}});
  dialog.querySelector('.dialog-tools')!.addEventListener('click',(event)=>{
    const action=(event.target as HTMLElement).closest<HTMLElement>('[data-zoom]')?.dataset.zoom;
    if(action==='in')zoom(1.2);if(action==='out')zoom(.8);if(action==='fit')fit();if(action==='reset'){scale=1;x=(viewport.clientWidth-width)/2;y=(viewport.clientHeight-height)/2;apply();}
    if(action==='copy')void copy(`${doc?.id??''}#${diagram.id}`);
    if(action==='text')showText(diagram.title,diagram.code,diagram.caption);
    if(action==='mermaid')download(`${diagram.title}.mmd`,diagram.code);
    if(action==='svg'){
      const clean=svg.cloneNode(true) as SVGSVGElement;
      for(const element of clean.querySelectorAll('script,foreignObject,image,a'))element.remove();
      for(const element of [clean,...clean.querySelectorAll('*')])for(const attribute of [...element.attributes])if(/^on/i.test(attribute.name)||/href$/i.test(attribute.name)||/url\(\s*["']?(?:https?:|data:|file:)/i.test(attribute.value))element.removeAttribute(attribute.name);
      clean.setAttribute('xmlns','http://www.w3.org/2000/svg');
      const metadata=document.createElementNS('http://www.w3.org/2000/svg','metadata');metadata.textContent=JSON.stringify({title:diagram.title,status:doc?.status,revision:doc?.revision,documentId:doc?.id,diagramId:diagram.id});clean.prepend(metadata);
      download(`${diagram.title}.svg`,new XMLSerializer().serializeToString(clean),'image/svg+xml;charset=utf-8');
    }
  });
}
document.addEventListener('click',(event)=>{
  const target=(event.target as HTMLElement).closest<HTMLElement>('button,a');if(!target)return;
  if(target.dataset.doc){event.preventDefault();if(textDialog.open)textDialog.close();void openDocument(target.dataset.doc,true,target.dataset.fragment??'');return;}
  if(target.dataset.reference){event.preventDefault();const request=++sourceRequest;showText(t('sources'),t('loading'));void api<ReferenceResult>(`/api/reference?${new URLSearchParams({from:target.dataset.referenceFrom??current?.id??'',target:target.dataset.reference})}`).then((result)=>{if(!textDialog.open||request!==sourceRequest)return;if(result.kind==='document'){textDialog.close();void openDocument(result.id!,true,result.fragment??'');}else if(result.kind==='markdown')showMarkdownReference(result);else showText(t('sources'),`${t('attachment')}\n\n${result.path}`);}).catch(()=>{if(textDialog.open&&request===sourceRequest)showText(t('sources'),t('referenceError'));});return;}
  if(target.dataset.collection){collection=target.dataset.collection;state.type='';history.pushState({},'','/');void library();return;}
  if(target.dataset.view){view=target.dataset.view;void library();return;}
  if(target.dataset.preview){const card=target.closest('.card')!;const existing=card.querySelector('.card-preview');if(existing){existing.remove();return;}const container=document.createElement('div');container.className='card-preview';container.textContent=t('loading');container.setAttribute('aria-live','polite');card.append(container);void api<KnowledgeDocument>(`/api/document?id=${encodeURIComponent(target.dataset.preview)}`).then((doc)=>{if(doc.diagrams[0])void draw(container,doc.diagrams[0]);}).catch(()=>{container.textContent=t('loadError');});return;}
  if(target.dataset.enlarge){const diagram=current?.diagrams.find((item)=>item.id===target.dataset.enlarge);if(diagram)void showDiagram(diagram);return;}
  if(target.dataset.diagramSource){const diagram=current?.diagrams.find((item)=>item.id===target.dataset.diagramSource);if(diagram)showText(diagram.title,diagram.code,diagram.caption);return;}
  if(target.dataset.source&&current){const request=++sourceRequest;showText(t('sources'),t('loading'));void api<{source:{path:string;repoId:string};text:string;startLine:number;endLine:number;fingerprint:string}>(`/api/source?document=${encodeURIComponent(current.id)}&id=${encodeURIComponent(target.dataset.source)}`).then((result)=>{if(textDialog.open&&request===sourceRequest)showText(`${result.source.repoId} / ${result.source.path}`,result.text,`${result.startLine}–${result.endLine} · ${result.fingerprint.slice(0,12)}`);}).catch(()=>{if(textDialog.open&&request===sourceRequest)showText(t('sources'),t('sourceMissing'));});return;}
  switch(target.dataset.action){
    case'menu':$('.shell').classList.add('menu-open');$('.mobile-close').focus();break;
    case'menu-close':$('.shell').classList.remove('menu-open');$('.mobile-menu').focus();break;
    case'locale':locale=locale==='en'?'zh-CN':'en';sessionStorage.setItem('lumine:ui-locale',locale);if(current)void openDocument(current.id,false);else void library();break;
    case'refresh':void start();break;
    case'retry-search':void results();break;
    case'back':history.pushState({},'','/');void library();break;
    case'copy-doc':if(current)void copy(current.id);break;
    case'edit-doc':if(current)void copy(locale==='zh-CN'?`请核实并更新知识 ${current.id}（${current.title}），保留人工修改，先核对当前来源。`:`Review and update knowledge ${current.id} (${current.title}). Verify current sources and preserve human edits.`);break;
    case'export-doc':if(current)download(`${current.title}.md`,current.markdown,'text/markdown;charset=utf-8');break;
    case'close-diagram':dialog.close();break;
    case'close-text':textDialog.close();break;
    case'reference-source':if(referenceText)showText(referenceText.title,referenceText.markdown);break;
    case'reference-export':if(referenceText)download(`${referenceText.title}.md`,referenceText.markdown,'text/markdown;charset=utf-8');break;
  }
});
document.addEventListener('keydown',(event)=>{if(event.key==='Escape'&&document.querySelector('.shell.menu-open')){$('.shell').classList.remove('menu-open');$('.mobile-menu').focus();}});
window.addEventListener('scroll',()=>{if(current)sessionStorage.setItem(`lumine:scroll:${current.id}`,String(window.scrollY));},{passive:true});
window.addEventListener('popstate',()=>{const id=new URL(location.href).searchParams.get('doc');if(id)void openDocument(id,false);else void library();});
async function start():Promise<void>{try{const [config,data]=await Promise.all([api<{locale:Locale}>('/api/config'),api<{documents:CatalogDocument[]}>('/api/catalog')]);const savedLocale=sessionStorage.getItem('lumine:ui-locale');locale=savedLocale==='zh-CN'||savedLocale==='en'?savedLocale:config.locale;catalog=data.documents;const id=new URL(location.href).searchParams.get('doc');if(id)await openDocument(id,false);else await library();}catch{app.innerHTML=`<div class="workspace"><div class="error">${t('loadError')} <button data-action="refresh">${t('retry')}</button></div></div>`;}}
void start();
