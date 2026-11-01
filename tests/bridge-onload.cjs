'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const test = require('node:test');

function loadPluginClass() {
  const originalLoad = Module._load;
  const fakeObsidian = {
    Plugin: class {}, ItemView: class {}, Notice: class {}, requestUrl: async () => ({ text: '' }),
    PluginSettingTab: class {}, Setting: class {}, setIcon() {}, Modal: class {},
  };
  Module._load = function (request, parent, isMain) {
    if (request === 'obsidian') return fakeObsidian;
    if (request === '@electron/remote') {
      return {
        getCurrentWindow: () => ({ id: 1 }),
        require: () => ({ retain() {}, release() {} }),
      };
    }
    return originalLoad.call(this, request, parent, isMain);
  };
  const filename = path.resolve(__dirname, '../main.js');
  const loaded = new Module(filename, module);
  loaded.filename = filename;
  loaded.paths = Module._nodeModulePaths(path.dirname(filename));
  loaded._compile(fs.readFileSync(filename, 'utf8') + '\nmodule.exports.Receptor = Receptor;\n', filename);
  return loaded.exports;
}

function fakeApp() {
  const event = () => ({ unload() {} });
  const secrets = new Map();
  return {
    metadataCache: { on: event, getFileCache: () => null },
    secretStorage: { getSecret: (id) => secrets.get(id) ?? null, setSecret: (id, value) => secrets.set(id, value) },
    workspace: { on: event, getLeavesOfType: () => [] },
    vault: { on: event, getMarkdownFiles: () => [], getAbstractFileByPath: () => null },
  };
}

function prepare(plugin) {
  plugin.app = fakeApp();
  plugin.manifest = { id: 'clippings-gallery', dir: '/synthetic/plugins/clippings-gallery' };
  plugin.registerView = () => {};
  plugin.addRibbonIcon = () => {};
  plugin.addCommand = () => {};
  plugin.registerEvent = () => {};
  plugin.register = () => {};
  plugin.addSettingTab = () => {};
  plugin.completarCapasDeFundo = () => {};
  plugin.receptor = null;
}

test('first onload generates a bridge token in SecretStorage', async () => {
  const PluginClass = loadPluginClass();
  const plugin = new PluginClass();
  prepare(plugin);
  const saved = [];
  plugin.loadData = async () => ({ capaLocal: false });
  plugin.saveData = async (data) => saved.push(data);
  PluginClass.Receptor.prototype.iniciar = function () {};
  PluginClass.Receptor.prototype.parar = function () {};

  await plugin.onload();
  assert.match(plugin.ponteToken, /^[0-9a-f]{64}$/);
  assert.equal(plugin.app.secretStorage.getSecret('corebrain-ponte-token'), plugin.ponteToken);
  assert.ok(saved.every((data) => !('ponteToken' in data)));
});

test('legacy token is migrated without replacement', async () => {
  const PluginClass = loadPluginClass();
  const plugin = new PluginClass();
  prepare(plugin);
  const token = 'b'.repeat(64);
  const saved = [];
  plugin.loadData = async () => ({ ponteToken: token, capaLocal: false });
  plugin.saveData = async (data) => saved.push(data);
  PluginClass.Receptor.prototype.iniciar = function () {};
  PluginClass.Receptor.prototype.parar = function () {};

  await plugin.onload();
  assert.equal(plugin.ponteToken, token);
  assert.equal(plugin.app.secretStorage.getSecret('corebrain-ponte-token'), token);
  assert.equal(saved.length, 1);
  assert.equal('ponteToken' in saved[0], false);
});

test('token already in SecretStorage survives a subsequent onload', async () => {
  const PluginClass = loadPluginClass();
  const plugin = new PluginClass();
  prepare(plugin);
  const token = 'c'.repeat(64);
  plugin.app.secretStorage.setSecret('corebrain-ponte-token', token);
  plugin.loadData = async () => ({ capaLocal: false });
  let writes = 0;
  plugin.saveData = async () => { writes++; };
  PluginClass.Receptor.prototype.iniciar = function () {};
  PluginClass.Receptor.prototype.parar = function () {};
  await plugin.onload();
  assert.equal(plugin.ponteToken, token);
  assert.equal(plugin.app.secretStorage.getSecret('corebrain-ponte-token'), token);
  assert.equal(writes, 0);
});
