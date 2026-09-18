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
    return originalLoad.call(this, request, parent, isMain);
  };
  try {
    const filename = path.resolve(__dirname, '../main.js');
    const loaded = new Module(filename, module);
    loaded.filename = filename;
    loaded.paths = Module._nodeModulePaths(path.dirname(filename));
    loaded._compile(fs.readFileSync(filename, 'utf8') + '\nmodule.exports.Receptor = Receptor;\n', filename);
    return loaded.exports;
  } finally {
    Module._load = originalLoad;
  }
}

function fakeApp() {
  const event = () => ({ unload() {} });
  return {
    metadataCache: { on: event, getFileCache: () => null },
    workspace: { on: event, getLeavesOfType: () => [] },
    vault: { on: event, getMarkdownFiles: () => [], getAbstractFileByPath: () => null },
  };
}

function prepare(plugin) {
  plugin.app = fakeApp();
  plugin.registerView = () => {};
  plugin.addRibbonIcon = () => {};
  plugin.addCommand = () => {};
  plugin.registerEvent = () => {};
  plugin.register = () => {};
  plugin.addSettingTab = () => {};
  plugin.completarCapasDeFundo = () => {};
  plugin.receptor = null;
}

test('first onload generates and persists a random bridge token', async () => {
  const PluginClass = loadPluginClass();
  const plugin = new PluginClass();
  prepare(plugin);
  const saved = [];
  plugin.loadData = async () => ({ capaLocal: false });
  plugin.saveData = async (data) => saved.push(data);
  PluginClass.Receptor.prototype.iniciar = function () {};
  PluginClass.Receptor.prototype.parar = function () {};

  await plugin.onload();
  assert.match(plugin.cfg.ponteToken, /^[0-9a-f]{64}$/);
  assert.equal(saved.length, 1);
  assert.equal(saved[0].ponteToken, plugin.cfg.ponteToken);
});

test('existing token survives a subsequent onload without replacement', async () => {
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
  assert.equal(plugin.cfg.ponteToken, token);
  assert.equal(saved.length, 0);
});
