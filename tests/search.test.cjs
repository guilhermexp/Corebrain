const test = require('node:test');
const assert = require('node:assert/strict');
const {loadMain, makeApp, makeFile, makePlugin, FakeElement, FakeClock} = require('./plugin-harness.cjs');
function setup(files, clock) {
 const {internals} = loadMain({clock}); const {app} = makeApp(files);
 const plugin=makePlugin(internals,app); const view=new internals.GaleriaView({app},plugin);
 view.atualizarResultados=()=>{};
 return {view,app,plugin};
}
const paths=v=>Array.from(v.notas(),x=>x.f.path);
test('search ignores accents/case and matches all words in any order across fields',()=>{
 const f=makeFile('Clippings/a.md',{title:'Automação de marketing',author:['José'],tags:['produtividade'],title_original:'Workflow'});
 const {view}=setup([f]);
 for (const q of ['AUTOMACAO','marketing automacao','jose produtividade','workflow automacao','   ']) {view.busca=q;assert.equal(paths(view).length,1,q);}
 view.busca='automacao inexistente';assert.equal(paths(view).length,0);
});
test('arrival ordering uses immutable arrival then ctime, never source date or mtime',()=>{
 const a=makeFile('Clippings/a.md',{created:'2099-01-01'});a.stat={ctime:1000,mtime:9000};
 const b=makeFile('Clippings/b.md',{created:'2000-01-01'});b.stat={ctime:2000,mtime:2000};
 const c=makeFile('Clippings/c.md',{corebrain_added_at:'2026-09-18T00:00:00Z'});c.stat={ctime:500,mtime:500};
 const {view}=setup([a,b,c]);assert.deepEqual(paths(view),[c.path,b.path,a.path]);
});
test('invalid arrival falls back to ctime and identical times use deterministic path order',()=>{
 const b=makeFile('Clippings/b.md',{corebrain_added_at:'bad'});b.stat.ctime=1000;
 const a=makeFile('Clippings/a.md',{});a.stat.ctime=1000;
 assert.deepEqual(paths(setup([b,a]).view),[a.path,b.path]);
});
test('body search is cached and updates when metadata changed supplies new content',async()=>{
 const f=makeFile('Clippings/a.md',{title:'Outro'},'Conteúdo exclusivo sobre astronomia');
 const {view,app}=setup([f]);view.busca='astronomia';let reads=0;
 app.vault.cachedRead=async()=>{reads++;return f.body};
 await view.indexarBusca();assert.equal(paths(view).length,1);
 await view.indexarBusca();assert.equal(reads,1);
 view.metadataMudou(f,'Novo corpo sobre oceanos',{frontmatter:f.frontmatter});
 assert.equal(paths(view).length,0);view.busca='oceanos';assert.equal(paths(view).length,1);
});
test('late read cannot overwrite newer body data',async()=>{
 const f=makeFile('Clippings/a.md',{},'old');const {view,app}=setup([f]);view.busca='atual';
 let finish;app.vault.cachedRead=()=>new Promise(r=>finish=r);
 const pending=view.indexarBusca();
 view.metadataMudou(f,'atual',{frontmatter:{}});finish('antigo');await pending;
 assert.equal(paths(view).length,1);
});
test('a deleted file does not get resurrected into the body index',async()=>{
 const f=makeFile('Clippings/a.md');const {view,app}=setup([f]);view.busca='old';
 let finish;app.vault.cachedRead=()=>new Promise(r=>finish=r);
 const pending=view.indexarBusca();app.vault.getAbstractFileByPath=()=>null;finish('old');await pending;
 assert.equal(view.corpoIndexado(f),null);
});
test('read errors do not reject the search promise or retry every keystroke',async()=>{
 const f=makeFile('Clippings/a.md');const {view,app}=setup([f]);view.busca='text';let reads=0;
 app.vault.cachedRead=async()=>{reads++;throw Error('unreadable')};
 await view.indexarBusca();await view.indexarBusca();assert.equal(reads,1);
 assert.equal(view.errosBusca,1);
});
test('search typing updates results without rebuilding input or moving caret',()=>{
 const clock=new FakeClock();const {view}=setup([],clock);const topo=new FakeElement();
 let renders=0,updates=0;view.render=()=>renders++;view.atualizarResultados=()=>updates++;view.indexarBusca=async()=>{};
 view.controleBusca(topo);const input=topo.children[0];input.value='marketing';input.selectionStart=3;input.selectionEnd=3;
 input.dispatchEvent('input');clock.runNext();
 assert.equal(renders,0);assert.equal(updates,1);assert.equal(topo.children[0],input);assert.equal(input.selectionStart,3);
});
test('highlighting preserves literal HTML as text and highlights accent-insensitive matches',()=>{
 const {view}=setup([]);view.busca='automacao';const el=new FakeElement();
 view.destacarBusca(el,'<img onerror=evil()> Automação');
 assert.equal(el.children.some(e=>e.tagName==='IMG'),false);
 assert.equal(el.children.filter(e=>e.tagName==='MARK')[0].textContent,'Automação');
 assert.equal(el.children.map(e=>e.textContent).join(''),'<img onerror=evil()> Automação');
});
test('metadata refresh keeps the search toolbar while a query is active',()=>{
 const {view}=setup([]);view.busca='text';let updates=0;
 const panel=new FakeElement();view.contentEl.querySelector=s=>s==='.cg-painel'?panel:null;
 view.contentEl.empty=()=>{throw Error('toolbar destroyed')};view.atualizarResultados=()=>updates++;
 view.indexarBusca=async()=>{};view.render(true);assert.equal(updates,1);
});
test('closed view discards pending indexing without scheduling a render',async()=>{
 const f=makeFile('Clippings/a.md');const {view,app}=setup([f]);view.busca='old';let finish,updates=0;
 view.atualizarResultados=()=>updates++;app.vault.cachedRead=()=>new Promise(r=>finish=r);
 const pending=view.indexarBusca();view._buscaFechada=true;finish('old');await pending;
 assert.equal(updates,0);assert.equal(view.corpoIndexado(f),null);
});
test('metadata fields update matching even when cards show the same title',()=>{
 const f=makeFile('Clippings/a.md',{title:'Title',author:'Maria'});const {view}=setup([f]);
 view.busca='joao';view.lembrarMetadata(f,{frontmatter:f.frontmatter});
 assert.equal(view.metadataMudou(f,'body',{frontmatter:{title:'Title',author:'João'}}),true);
});
test('body search omits YAML syntax and private metadata keys from the full-text body',async()=>{
 const f=makeFile('Clippings/a.md',{},'---\ninternal_only: ignoredmarker\n---\nAstronomia');const {view}=setup([f]);
 view.busca='ignoredmarker';await view.indexarBusca();assert.equal(paths(view).length,0);
 view.busca='astronomia';assert.equal(paths(view).length,1);
});
test('resizing masonry keeps chronological result order rather than column-major DOM order',()=>{
 const {view}=setup([]);const a=new FakeElement(),b=new FakeElement(),c=new FakeElement();
 a.setAttr('data-cg-path','a');b.setAttr('data-cg-path','b');c.setAttr('data-cg-path','c');
 view.fila=['a','b','c'].map(path=>({f:{path}}));
 view.colunas=[new FakeElement(),new FakeElement()];
 view.grade=new FakeElement();view.grade.clientWidth=1200;view.grade.querySelectorAll=()=>[a,c,b];
 const applied=[];view.colunaMaisCurta=()=>({appendChild:el=>applied.push(el.getAttribute('data-cg-path'))});
 view.montarColunas();assert.deepEqual(applied,['a','b','c']);
});
test('clearing a query does not lose input on the next background metadata refresh',()=>{
 const {view}=setup([]);view.busca='';let updates=0;
 view.contentEl.querySelector=s=>s==='.cg-painel'?new FakeElement():null;
 view.contentEl.empty=()=>{throw Error('empty search input destroyed')};
 view.atualizarResultados=()=>updates++;view.render(true);assert.equal(updates,1);
});
