const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { loadMain, makeApp, makePlugin } = require("./plugin-harness.cjs");

const PLUGIN_DIR = path.resolve(__dirname, "..");
const MODULE_PATH = path.join(PLUGIN_DIR, "window-lifecycle.js");

function fakeElectron() {
  const windows = new Map();
  const appListeners = new Map();
  const app = {
    on(name, fn) {
      if (!appListeners.has(name)) appListeners.set(name, new Set());
      appListeners.get(name).add(fn);
    },
    removeListener(name, fn) {
      appListeners.get(name)?.delete(fn);
    },
    emit(name, event) {
      for (const fn of [...(appListeners.get(name) || [])]) fn(event);
    },
    listenerCount(name) {
      return appListeners.get(name)?.size || 0;
    },
  };
  function createWindow(id) {
    const listeners = new Map();
    const win = {
      id,
      destroyed: false,
      visible: true,
      isDestroyed() { return this.destroyed; },
      isVisible() { return this.visible; },
      hide() { this.visible = false; },
      show() { this.visible = true; },
      on(name, fn) {
        if (!listeners.has(name)) listeners.set(name, new Set());
        listeners.get(name).add(fn);
      },
      removeListener(name, fn) {
        listeners.get(name)?.delete(fn);
      },
      emit(name, event) {
        for (const fn of [...(listeners.get(name) || [])]) fn(event);
      },
      listenerCount(name) {
        return listeners.get(name)?.size || 0;
      },
    };
    windows.set(id, win);
    return win;
  }
  return {
    app,
    BrowserWindow: { fromId: (id) => windows.get(id) || null },
    createWindow,
  };
}

function loadLifecycle(electron, modulePath = MODULE_PATH) {
  const source = fs.readFileSync(modulePath, "utf8");
  const sandbox = {
    module: { exports: {} },
    exports: {},
    require(name) {
      if (name === "electron") return electron;
      throw new Error(`modulo de ciclo de vida nao pode carregar ${name}`);
    },
  };
  vm.runInNewContext(source, sandbox, { filename: modulePath });
  return sandbox.module.exports;
}

function closeEvent() {
  return { defaultPrevented: false, preventDefault() { this.defaultPrevented = true; } };
}

function unload(plugin) {
  for (const fn of plugin._registrations) if (typeof fn === "function") fn();
}

test("closing the retained vault window hides it and prevents destruction", () => {
  const electron = fakeElectron();
  const win = electron.createWindow(7);
  const other = electron.createWindow(8);
  const api = loadLifecycle(electron);
  api.retain("vault-a", 7);

  const ignored = closeEvent();
  other.emit("close", ignored);
  assert.equal(ignored.defaultPrevented, false);
  assert.equal(other.visible, true);

  const event = closeEvent();
  win.emit("close", event);
  assert.equal(event.defaultPrevented, true);
  assert.equal(win.visible, false);
});

test("explicit quit closes the retained window and Dock activation shows it again", () => {
  const electron = fakeElectron();
  const win = electron.createWindow(3);
  const api = loadLifecycle(electron);
  api.retain("vault-a", 3);

  electron.app.emit("before-quit", closeEvent());
  const quitting = closeEvent();
  win.emit("close", quitting);
  assert.equal(quitting.defaultPrevented, false);
  assert.equal(win.visible, true);

  electron.app.emit("activate");
  win.hide();
  const afterCancel = closeEvent();
  win.emit("close", afterCancel);
  assert.equal(afterCancel.defaultPrevented, true);
  assert.equal(win.visible, false);

  electron.app.emit("activate");
  assert.equal(win.visible, true);
  assert.equal(electron.BrowserWindow.fromId(3), win);
});

test("release removes close and app handlers for that owner only", () => {
  const electron = fakeElectron();
  const kept = electron.createWindow(1);
  const dropped = electron.createWindow(2);
  const api = loadLifecycle(electron);
  api.retain("keep", 1);
  api.retain("drop", 2);
  api.release("drop");
  assert.equal(dropped.listenerCount("close"), 0);

  const droppedEvent = closeEvent();
  dropped.emit("close", droppedEvent);
  assert.equal(droppedEvent.defaultPrevented, false);

  const keptEvent = closeEvent();
  kept.emit("close", keptEvent);
  assert.equal(keptEvent.defaultPrevented, true);
  api.release("keep");
  assert.equal(kept.listenerCount("close"), 0);
  assert.equal(electron.app.listenerCount("before-quit"), 0);
  assert.equal(electron.app.listenerCount("activate"), 0);
});

test("retaining again does not stack handlers and a missing window throws", () => {
  const electron = fakeElectron();
  const win = electron.createWindow(4);
  const api = loadLifecycle(electron);
  api.retain("vault-a", 4);
  api.retain("vault-a", 4);
  assert.equal(win.listenerCount("close"), 1);
  assert.equal(electron.app.listenerCount("activate"), 1);
  assert.throws(() => api.retain("vault-b", 99), /janela do vault indisponivel/);
  assert.equal(electron.app.listenerCount("before-quit"), 1);
});

test("darwin onload loads the real lifecycle module and unload lets the window close", async () => {
  const layouts = [
    { dir: PLUGIN_DIR },
    { dir: path.basename(PLUGIN_DIR), basePath: path.dirname(PLUGIN_DIR) },
  ];
  for (const layout of layouts) {
    const electron = fakeElectron();
    const win = electron.createWindow(7);
    const { internals } = loadMain({
      processImpl: { platform: "darwin" },
      modules: {
        "@electron/remote": {
          getCurrentWindow: () => win,
          require: (modulePath) => loadLifecycle(electron, path.resolve(modulePath)),
        },
      },
    });
    const { app } = makeApp();
    if (layout.basePath) app.vault.adapter.basePath = layout.basePath;
    const plugin = makePlugin(internals, app);
    plugin.manifest = { id: "clippings-gallery", dir: layout.dir };
    await plugin.onload();

    const hiding = closeEvent();
    win.emit("close", hiding);
    assert.equal(hiding.defaultPrevented, true, layout.dir);
    assert.equal(win.visible, false, layout.dir);

    unload(plugin);
    const released = closeEvent();
    win.emit("close", released);
    assert.equal(released.defaultPrevented, false, layout.dir);
    assert.equal(win.listenerCount("close"), 0, layout.dir);
    assert.equal(electron.app.listenerCount("before-quit"), 0, layout.dir);
    assert.equal(electron.app.listenerCount("activate"), 0, layout.dir);
  }
});

test("darwin onload fails visibly when the plugin directory cannot be resolved", async () => {
  const electron = fakeElectron();
  electron.createWindow(1);
  const { internals } = loadMain({
    processImpl: { platform: "darwin" },
    modules: {
      "@electron/remote": {
        getCurrentWindow: () => ({ id: 1 }),
        require() { throw new Error("nao deveria carregar o modulo"); },
      },
    },
  });
  const plugin = makePlugin(internals, makeApp().app);
  await assert.rejects(plugin.onload(), /diretorio do plugin indisponivel/);
});
