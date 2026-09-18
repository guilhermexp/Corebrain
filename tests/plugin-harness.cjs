const fs = require("node:fs");
const vm = require("node:vm");

class EventBus {
  constructor() {
    this.listeners = new Set();
  }

  on(fn) {
    this.listeners.add(fn);
    return { off: () => this.listeners.delete(fn) };
  }

  emit(...args) {
    for (const fn of [...this.listeners]) fn(...args);
  }
}

class FakeElement {
  constructor(tag = "div", opts = {}) {
    this.tagName = tag.toUpperCase();
    this.children = [];
    this.parentElement = null;
    this.classList = new Set();
    this.attributes = {};
    this.listeners = new Map();
    this.textContent = opts.text || "";
    this.value = opts.value || "";
    this.scrollTop = 0;
    this.clientWidth = opts.clientWidth || 900;
    this.offsetHeight = opts.offsetHeight || 100;
    this.isConnected = true;
    if (opts.cls) this.addClass(opts.cls);
    if (opts.attr) this.setAttrs(opts.attr);
  }

  appendChild(child) {
    child.parentElement = this;
    child.isConnected = true;
    this.children.push(child);
    return child;
  }

  removeChild(child) {
    const i = this.children.indexOf(child);
    if (i >= 0) this.children.splice(i, 1);
    child.parentElement = null;
    child.isConnected = false;
    return child;
  }

  remove() {
    this.parentElement?.removeChild(this);
  }

  empty() {
    for (const child of this.children) {
      child.parentElement = null;
      child.isConnected = false;
    }
    this.children = [];
  }

  createDiv(opts = {}) {
    return this.appendChild(new FakeElement("div", opts));
  }

  createSpan(opts = {}) {
    return this.appendChild(new FakeElement("span", opts));
  }

  createEl(tag, opts = {}) {
    return this.appendChild(new FakeElement(tag, opts));
  }

  addEventListener(name, fn) {
    if (!this.listeners.has(name)) this.listeners.set(name, new Set());
    this.listeners.get(name).add(fn);
  }

  removeEventListener(name, fn) {
    this.listeners.get(name)?.delete(fn);
  }

  dispatchEvent(event) {
    const e = typeof event === "string" ? { type: event } : event;
    e.target ||= this;
    for (const fn of [...(this.listeners.get(e.type) || [])]) fn(e);
    return true;
  }

  click() {
    this.dispatchEvent({ type: "click", preventDefault() {}, stopPropagation() {} });
  }

  setAttr(name, value) {
    this.attributes[name] = String(value);
    if (name === "src") this.src = String(value);
    return this;
  }

  setAttrs(attrs) {
    for (const [name, value] of Object.entries(attrs || {})) this.setAttr(name, value);
    return this;
  }

  getAttribute(name) {
    return this.attributes[name] ?? null;
  }

  setText(value) {
    this.textContent = String(value);
  }

  addClass(...names) {
    for (const name of names.flatMap((n) => String(n).split(/\s+/)).filter(Boolean)) this.classList.add(name);
    return this;
  }

  removeClass(...names) {
    for (const name of names.flatMap((n) => String(n).split(/\s+/)).filter(Boolean)) this.classList.delete(name);
    return this;
  }

  toggleClass(name, on) {
    if (on) this.classList.add(name);
    else this.classList.delete(name);
    return this;
  }

  hasClass(name) {
    return this.classList.has(name);
  }

  setAttribute(name, value) {
    return this.setAttr(name, value);
  }

  getBoundingClientRect() {
    return { top: 0, bottom: 100, left: 0, right: 100 };
  }

  querySelector() {
    return null;
  }

  querySelectorAll() {
    return [];
  }
}

class FakeImage extends FakeElement {
  constructor(opts = {}) {
    super("img", opts);
    this._src = "";
    if (opts.src) this.src = opts.src;
  }

  get src() {
    return this._src;
  }

  set src(value) {
    this._src = String(value);
    this.attributes.src = this._src;
  }
}

class FakeClock {
  constructor() {
    this.nextId = 1;
    this.jobs = new Map();
  }

  setTimeout = (fn, delay = 0) => {
    const id = this.nextId++;
    this.jobs.set(id, { fn, delay });
    return id;
  };

  clearTimeout = (id) => {
    this.jobs.delete(id);
  };

  runNext() {
    const first = this.jobs.keys().next();
    if (first.done) return false;
    const job = this.jobs.get(first.value);
    this.jobs.delete(first.value);
    job.fn();
    return true;
  }

  runAll() {
    while (this.runNext()) {}
  }
}

class FakePlugin {
  constructor(app) {
    this.app = app;
    this._registrations = [];
  }

  register(fn) {
    this._registrations.push(fn);
  }

  registerEvent(event) {
    this._registrations.push(event);
  }

  registerView() {}
  addRibbonIcon() {}
  addCommand() {}
  addSettingTab() {}
  async loadData() {
    return {};
  }
  async saveData(data) {
    this.savedData = data;
  }
}

class FakeItemView {
  constructor(leaf = {}) {
    this.leaf = leaf;
    this.app = leaf.app;
    this.contentEl = new FakeElement("div");
    this._registrations = [];
  }

  register(fn) {
    this._registrations.push(fn);
  }

  registerEvent(event) {
    this._registrations.push(event);
  }

  registerDomEvent(el, event, fn) {
    el.addEventListener(event, fn);
  }
}

class FakeModal {
  constructor(app) {
    this.app = app;
    this.contentEl = new FakeElement("div");
    this.modalEl = new FakeElement("div");
    this.containerEl = new FakeElement("div");
  }

  open() {}
  close() {}
}

class FakeSettingTab {
  constructor(app, plugin) {
    this.app = app;
    this.plugin = plugin;
    this.containerEl = new FakeElement("div");
  }
}

class FakeSetting {
  constructor(container) {
    this.containerEl = container;
  }
  setName() { return this; }
  setDesc() { return this; }
  addText(cb) { cb?.({ setPlaceholder() { return this; }, setValue() { return this; }, onChange() { return this; } }); return this; }
  addToggle(cb) { cb?.({ setValue() { return this; }, onChange() { return this; } }); return this; }
  addDropdown(cb) { cb?.({ addOption() { return this; }, setValue() { return this; }, onChange() { return this; } }); return this; }
  addButton(cb) { cb?.({ setButtonText() { return this; }, setCta() { return this; }, setWarning() { return this; }, onClick() { return this; } }); return this; }
}

class FakeNotice {
  static all = [];

  constructor(message, timeout) {
    this.message = message;
    this.timeout = timeout;
    this.messageEl = new FakeElement("div", { text: message });
    this.hidden = false;
    FakeNotice.all.push(this);
  }

  setMessage(message) {
    this.message = message;
  }

  hide() {
    this.hidden = true;
  }
}

function makeFile(path, frontmatter = {}, body = "") {
  const parts = path.split("/");
  return {
    path,
    name: parts.at(-1),
    basename: parts.at(-1).replace(/\.md$/, ""),
    stat: { ctime: Date.now() },
    frontmatter,
    body,
  };
}

function makeApp(files = []) {
  const metadataChanged = new EventBus();
  const vaultEvents = { modify: new EventBus(), delete: new EventBus(), rename: new EventBus(), create: new EventBus() };
  const allFiles = [...files];
  const stored = new Map(allFiles.map((f) => [f.path, f]));
  const binary = new Map();
  const vault = {
    getMarkdownFiles: () => allFiles.filter((f) => f.path.endsWith(".md")),
    getAbstractFileByPath: (path) => stored.get(path) || binary.get(path) || null,
    createFolder: async (path) => {
      stored.set(path, { path, isFolder: true });
    },
    createBinary: async (path, data) => {
      const f = { path, data };
      binary.set(path, f);
      return f;
    },
    create: async (path, body) => {
      const arrival = String(body || "").match(/^---\r?\n[\s\S]*?^corebrain_added_at:\s*["']?([^\r\n"']+)["']?\s*$/m);
      const f = makeFile(path, arrival ? { corebrain_added_at: arrival[1] } : {}, body);
      allFiles.push(f);
      stored.set(path, f);
      vaultEvents.create.emit(f);
      return f;
    },
    read: async (file) => file.body || "",
    cachedRead: async (file) => file.body || "",
    adapter: { getResourcePath: (path) => `app://${path}` },
    on: (name, fn) => vaultEvents[name].on(fn),
    emit: (name, ...args) => vaultEvents[name].emit(...args),
  };
  const metadataCache = {
    on: (_name, fn) => metadataChanged.on(fn),
    emit: (...args) => metadataChanged.emit(...args),
    getFileCache: (file) => (file ? { frontmatter: file.frontmatter || {} } : null),
  };
  const layoutReady = [];
  const workspace = {
    leaves: [],
    on: () => ({ off() {} }),
    getLeavesOfType: () => [],
    getMostRecentLeaf: () => null,
    iterateAllLeaves: () => {},
    revealLeaf: () => {},
    getLeaf: () => ({ setViewState: async () => {}, openFile: async () => {} }),
    onLayoutReady: (fn) => layoutReady.push(fn),
    emitLayoutReady: () => { for (const fn of layoutReady.splice(0)) fn(); },
  };
  const fileManager = {
    processFrontMatter: async (file, fn) => {
      fn(file.frontmatter);
      metadataChanged.emit(file, null, { frontmatter: file.frontmatter });
    },
    trashFile: async (file) => {
      const i = allFiles.indexOf(file);
      if (i >= 0) allFiles.splice(i, 1);
      stored.delete(file.path);
    },
  };
  const app = { vault, metadataCache, workspace, fileManager };
  return { app, files: allFiles, metadataChanged, vaultEvents, stored, binary };
}

function loadMain({ requestUrl = async () => ({ text: "", json: {}, status: 200 }), clock } = {}) {
  FakeNotice.all = [];
  const source = fs.readFileSync(`${__dirname}/../main.js`, "utf8");
  const obsidian = {
    Plugin: FakePlugin,
    ItemView: FakeItemView,
    Notice: FakeNotice,
    requestUrl,
    PluginSettingTab: FakeSettingTab,
    Setting: FakeSetting,
    setIcon() {},
    Modal: FakeModal,
  };
  const document = {
    createElementNS: (_ns, tag) => new FakeElement(tag),
    createElement: (tag) => (tag === "img" ? new FakeImage() : new FakeElement(tag)),
    body: new FakeElement("body"),
  };
  const timers = clock || { setTimeout, clearTimeout };
  const sandbox = {
    module: { exports: {} },
    exports: {},
    console,
    require(name) {
      if (name === "obsidian") return obsidian;
      if (name === "http") return { createServer: () => ({ on() {}, listen() {}, close() {} }) };
      return require(name);
    },
    document,
    window: { open() {} },
    navigator: { clipboard: { writeText: async () => {} } },
    URL,
    Buffer,
    Blob: global.Blob,
    OffscreenCanvas: global.OffscreenCanvas,
    createImageBitmap: global.createImageBitmap,
    IntersectionObserver: class { observe() {} disconnect() {} },
    ResizeObserver: class { observe() {} disconnect() {} },
    getComputedStyle: () => ({ getPropertyValue: () => "300" }),
    setTimeout: timers.setTimeout,
    clearTimeout: timers.clearTimeout,
    Math,
    Date,
  };
  const instrumented = `${source}\nmodule.exports = {\n  ClippingsGallery: module.exports,\n  GaleriaView,\n  Classificador,\n  Tradutor,\n  Receptor,\n  capaComRetentativa,\n  PADRAO,\n};`;
  vm.runInNewContext(instrumented, sandbox, { filename: "main.js" });
  return { internals: sandbox.module.exports, notices: FakeNotice.all, FakeElement, FakeImage, FakeClock };
}

function makePlugin(internals, app) {
  const plugin = new internals.ClippingsGallery(app, {});
  plugin.cfg = {
    ...internals.PADRAO,
    pastas: ["Clippings"],
    colecoes: ["videos"],
    modeloChave: "test-key",
    buscas: {},
  };
  plugin.aplicarPastas();
  plugin.emAndamento = new Set();
  plugin.imgs = new Map();
  plugin.saveData = async (data) => {
    plugin.savedData = data;
  };
  return plugin;
}

module.exports = {
  EventBus,
  FakeElement,
  FakeImage,
  FakeClock,
  FakeNotice,
  makeApp,
  makeFile,
  makePlugin,
  loadMain,
};
