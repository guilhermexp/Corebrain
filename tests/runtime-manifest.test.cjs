const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const file=path.join(__dirname,'../agent/runtime/package.json');
test('runtime declares only exact, owned packaged dependency versions',()=>{
 assert.ok(fs.existsSync(file),'isolated runtime manifest must exist');
 const p=JSON.parse(fs.readFileSync(file,'utf8'));
 assert.equal(p.private,true);
 assert.deepEqual(p.dependencies,{
  '@earendil-works/pi-coding-agent':'0.85.1',
  'pi-hermes-memory':'0.9.9',
  'context-mode':'1.0.169'
 });
 assert.equal(p.scripts,undefined,'runtime must not auto-install/upgrade packages');
});
