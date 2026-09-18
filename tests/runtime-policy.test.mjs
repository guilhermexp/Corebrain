import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { createRuntimePolicy, runtimeResources } from '../agent/runtime-policy.mjs';
const root = path.resolve('test-fixture/corebrain');
const vault = path.resolve('test-fixture/vault');
const state = path.resolve('test-fixture/private-state');
const auth = path.resolve('test-fixture/user-pi/auth.json');
const input = {pluginDirectory:root,vaultDirectory:vault,stateDirectory:state,authFile:auth};
test('uses owned state and explicit auth without inheriting Pi settings', () => {
 const p=createRuntimePolicy({...input,parentEnv:{HOME:'/outside',USERPROFILE:'/outside',PI_CODING_AGENT_DIR:'/outside/pi',NODE_OPTIONS:'--require /evil.js',NODE_PATH:'/outside/modules',PI_PACKAGE_DIR:'/outside/packages',ANTHROPIC_API_KEY:'not-forwarded',PATH:'/host/bin'}});
 assert.equal(p.cwd,vault); assert.equal(p.authFile,auth);
 assert.equal(p.env.HOME,path.join(state,'home'));
 assert.equal(p.env.USERPROFILE,path.join(state,'home'));
 assert.equal(p.env.PI_CODING_AGENT_DIR,path.join(state,'pi'));
 for(const k of ['NODE_OPTIONS','NODE_PATH','PI_PACKAGE_DIR','ANTHROPIC_API_KEY']) assert.equal(p.env[k],undefined);
 assert.equal(p.env.PATH,'/host/bin');
});
test('only exact bundled extensions and skills are selected', () => {
 const r=runtimeResources(root);
 assert.deepEqual(r.extensionPaths,[path.join(root,'agent/runtime/node_modules/pi-hermes-memory/src/index.ts'),path.join(root,'agent/runtime/node_modules/context-mode/build/adapters/pi/extension.js')]);
 assert.deepEqual(r.skillPaths,['corebrain-search','corebrain-organize','corebrain-synthesize'].map(n=>path.join(root,'skills',n)));
 const p=createRuntimePolicy({...input,extensions:['/evil'],skills:['/evil'],parentEnv:{}});
 assert.deepEqual(p.resources,r);
 for(const k of ['noExtensions','noSkills','noPromptTemplates','noThemes','noContextFiles']) assert.equal(p.loader[k],true);
 assert.deepEqual(p.settings,{});
});
test('requires explicit absolute roots and rejects shared state', () => {
 for(const k of ['pluginDirectory','vaultDirectory','stateDirectory']) {
  assert.throws(()=>createRuntimePolicy({...input,[k]:'relative'}),/absolute/);
 }
 assert.throws(()=>createRuntimePolicy({...input,stateDirectory:root}),/state/);
 assert.throws(()=>createRuntimePolicy({...input,stateDirectory:vault}),/state/);
 assert.throws(()=>createRuntimePolicy({...input,authFile:'auth.json'}),/absolute/);
});
test('disables credential reuse when none supplied, never guesses global auth', () => {
 const p=createRuntimePolicy({...input,authFile:undefined,parentEnv:{HOME:'/outside'}});
 assert.equal(p.authFile,path.join(state,'pi','auth.json'));
});
test('isolates standard configuration and cache discovery', () => {
 const p=createRuntimePolicy({...input,parentEnv:{XDG_CONFIG_HOME:'/outside',XDG_CACHE_HOME:'/outside',APPDATA:'/outside',LOCALAPPDATA:'/outside',BASH_ENV:'/evil',ENV:'/evil',ELECTRON_RUN_AS_NODE:'1'}});
 for(const k of ['XDG_CONFIG_HOME','XDG_CACHE_HOME','XDG_DATA_HOME','APPDATA','LOCALAPPDATA']) assert.ok(p.env[k].startsWith(state+path.sep));
 for(const k of ['BASH_ENV','ENV','ELECTRON_RUN_AS_NODE']) assert.equal(p.env[k],undefined);
});
test('rejects trailing-separator aliases of shared roots', () => {
 assert.throws(()=>createRuntimePolicy({...input,stateDirectory:root+path.sep}),/state/);
 assert.throws(()=>createRuntimePolicy({...input,stateDirectory:vault+path.sep}),/state/);
});
test('rejects symlink aliases of shared roots', async () => {
 const fs=await import('node:fs'); const os=await import('node:os');
 const temporary=fs.mkdtempSync(path.join(os.tmpdir(),'corebrain-policy-'));
 try {
  const plugin=path.join(temporary,'plugin'), alias=path.join(temporary,'alias');
  fs.mkdirSync(plugin); fs.symlinkSync(plugin,alias,'junction');
  assert.throws(()=>createRuntimePolicy({...input,pluginDirectory:plugin,stateDirectory:alias}),/state/);
 } finally {fs.rmSync(temporary,{recursive:true,force:true});}
});
