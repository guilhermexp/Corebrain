const test=require('node:test');
const assert=require('node:assert/strict');
const {loadMain,makeApp,makeFile,makePlugin,FakeElement}=require('./plugin-harness.cjs');
function setup(mode='split') {
 const {internals,notices}=loadMain();const {app}=makeApp();const plugin=makePlugin(internals,app);
 plugin.cfg.abrirClipping=mode;
 const view=new internals.GaleriaView({app},plugin);const leaves=[];let modals=0;
 internals.FichaModal.prototype.open=function(){modals++};
 app.workspace.iterateAllLeaves=fn=>leaves.forEach(fn);
 app.workspace.getLeaf=(kind,direction)=>{
  const leaf={kind,direction,states:[],files:[],setViewState:async function(s){this.states.push(s)},openFile:async function(f){this.files.push(f)}};
  leaves.push(leaf);return leaf;
 };
 return {view,plugin,app,leaves,notices,get modals(){return modals}};
}
test('split opens ordinary websites and videos in one reused vertical pane',async()=>{
 const s=setup();const file=makeFile('Clippings/test.md');
 await s.view.abrirClipping(file,{source:'https://example.com/article'});
 await s.view.abrirClipping(file,{source:'https://www.youtube.com/watch?v=test'});
 assert.equal(s.leaves.length,1);assert.equal(s.leaves[0].kind,'split');assert.equal(s.leaves[0].direction,'vertical');
 assert.equal(s.leaves[0].states.length,2);assert.equal(s.leaves[0].states[0].type,'webviewer');
 assert.equal(s.leaves[0].states[1].state.navigate,true);assert.equal(s.modals,0);
});
test('overlay remains default and unknown preference falls back to overlay',async()=>{
 for(const mode of ['overlay',undefined,'bad']){const s=setup(mode);s.plugin.cfg.abrirClipping=mode;await s.view.abrirClipping(makeFile('Clippings/test.md'),{source:'https://example.com'});assert.equal(s.modals,1);assert.equal(s.leaves.length,0);}
 assert.equal(loadMain().internals.PADRAO.abrirClipping,'overlay');
});
test('missing invalid and unsafe URLs open the note instead, in the same side panel',async()=>{
 const s=setup();const f=makeFile('Clippings/test.md');
 for(const source of ['', 'not a url','javascript:alert(1)','file:///etc/passwd','obsidian://new']) await s.view.abrirClipping(f,{source});
 assert.equal(s.leaves.length,1);assert.equal(s.leaves[0].files.length,5);assert.equal(s.leaves[0].states.length,0);
});
test('closed side panel is recreated and rapid clicks reserve one panel',async()=>{
 const s=setup();const f=makeFile('Clippings/test.md');
 await Promise.all([s.view.abrirClipping(f,{source:'https://example.com/a'}),s.view.abrirClipping(f,{source:'https://example.com/b'})]);
 assert.equal(s.leaves.length,1);s.leaves.splice(0);
 await s.view.abrirClipping(f,{source:'https://example.com/c'});assert.equal(s.leaves.length,1);
});
test('modifier click opens note tab; action buttons do not open clipping',()=>{
 const s=setup();const el=new FakeElement();const f=makeFile('Clippings/test.md');let opened=0;
 s.view.abrirClipping=async()=>opened++;s.view.abrirAoClicar(el,f,{});
 const handler=[...el.listeners.get('click')][0];
 handler({target:{closest:()=>false},metaKey:true});assert.equal(s.leaves[0].kind,'tab');
 handler({target:{closest:()=>true}});assert.equal(opened,0);
 handler({target:{closest:()=>false}});assert.equal(opened,1);
});
test('failed webviewer navigation falls back to note and reports a notice',async()=>{
 const s=setup();const f=makeFile('Clippings/test.md');
 await s.view.abrirClipping(f,{});s.leaves[0].setViewState=async()=>{throw Error('viewer disabled')};
 await s.view.abrirClipping(f,{source:'https://example.com'});
 assert.equal(s.leaves[0].files.length,2);assert.ok(s.notices.length>0);
});
test('closing pane during navigation cancels queued work and stale reveals',async()=>{
 const s=setup();const f=makeFile('Clippings/test.md');await s.view.abrirClipping(f,{});
 let finish;let calls=0;let revealed=0;
 s.leaves[0].setViewState=()=>{calls++;return calls === 1 ? new Promise(r=>finish=r) : Promise.resolve()};
 s.app.workspace.revealLeaf=()=>revealed++;
 const a=s.view.abrirClipping(f,{source:'https://example.com/a'});
 const b=s.view.abrirClipping(f,{source:'https://example.com/b'});
 await new Promise(r=>setImmediate(r));s.leaves.splice(0);finish();await Promise.all([a,b]);
 assert.equal(calls,1);assert.equal(revealed,0);
});
test('Instagram preparation never touches unrelated host with instagram.com in query',async()=>{
 const {FakeClock}=require('./plugin-harness.cjs');const clock=new FakeClock();const {internals}=loadMain({clock});let executed=0;
 const task=internals.prepararInstagram({view:{url:'https://example.com/?instagram.com',webview:{executeJavaScript:async()=>{executed++;return {modal:true,som:true}}}}});
 clock.runNext();await task;assert.equal(executed,0);
});
test('new side pane is anchored to gallery even when another pane is active',async()=>{
 const s=setup();let anchor;
 s.app.workspace.createLeafBySplit=(leaf,direction,before)=>{anchor={leaf,direction,before};return s.app.workspace.getLeaf('split',direction)};
 await s.view.abrirClipping(makeFile('Clippings/test.md'),{});
 assert.equal(anchor?.leaf,s.view.leaf);assert.equal(anchor.direction,'vertical');assert.equal(anchor.before,false);
});
