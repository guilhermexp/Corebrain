'use strict';

const assert = require('node:assert/strict');
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const { once } = require('node:events');
const Module = require('node:module');
const test = require('node:test');

function loadPluginModule() {
  const originalLoad = Module._load;
  const fakeObsidian = {
    Plugin: class {},
    ItemView: class {},
    Notice: class { constructor() {} setMessage() {} hide() {} },
    requestUrl: async () => ({ text: '' }),
    PluginSettingTab: class {},
    Setting: class {},
    setIcon() {},
    Modal: class {},
  };
  Module._load = function (request, parent, isMain) {
    if (request === 'obsidian') return fakeObsidian;
    return originalLoad.call(this, request, parent, isMain);
  };
  try {
    // Receptor is an internal implementation detail; expose it only from this
    // in-memory test compilation instead of changing the shipped plugin API.
    const filename = path.resolve(__dirname, '../main.js');
    const loaded = new Module(filename, module);
    loaded.filename = filename;
    loaded.paths = Module._nodeModulePaths(path.dirname(filename));
    loaded._compile(fs.readFileSync(filename, 'utf8') + '\nmodule.exports.Receptor = Receptor;\nmodule.exports.origemPermitida = origemPermitida;\n', filename);
    return loaded.exports;
  } finally {
    Module._load = originalLoad;
  }
}

const PluginClass = loadPluginModule();
const { Receptor } = PluginClass;

function createVault() {
  const files = new Map();
  return {
    files,
    getAbstractFileByPath(path) {
      return files.has(path) ? { path } : null;
    },
    getMarkdownFiles() {
      return [...files.keys()]
        .filter((path) => path.endsWith('.md'))
        .map((path) => ({ path, basename: path.split('/').pop().replace(/\.md$/, '') }));
    },
    async createFolder(path) {
      files.set(path, { path, folder: true });
    },
    async create(path, content) {
      files.set(path, { path, content });
      return { path };
    },
    async cachedRead(file) {
      return files.get(file.path)?.content || '';
    },
  };
}

function makePlugin(port) {
  const vault = createVault();
  const plugin = {
    cfg: { porta: port, ponteToken: 'a'.repeat(64), pastaBookmarks: 'Clippings' },
    pastas: ['Clippings/'],
    app: {
      vault,
      metadataCache: { getFileCache: (file) => file?.frontmatter ? { frontmatter: file.frontmatter } : null },
      workspace: { getLeavesOfType: () => [] },
    },
    notaComSource: () => null,
  };
  return { plugin, vault };
}

async function startServer() {
  const serverProbe = http.createServer();
  await new Promise((resolve) => serverProbe.listen(0, '127.0.0.1', resolve));
  const port = serverProbe.address().port;
  await new Promise((resolve) => serverProbe.close(resolve));

  const { plugin, vault } = makePlugin(port);
  const receptor = new Receptor(plugin);
  receptor.iniciar();
  await once(receptor.servidor, 'listening');
  return { receptor, plugin, vault, port };
}

function request(port, path, options = {}, body) {
  return new Promise((resolve, reject) => {
    const req = http.request({
      host: '127.0.0.1',
      port,
      path,
      method: options.method || 'GET',
      headers: options.headers || {},
    }, (res) => {
      let text = '';
      res.setEncoding('utf8');
      res.on('data', (chunk) => { text += chunk; });
      res.on('end', () => {
        let json;
        try { json = text ? JSON.parse(text) : null; } catch { json = null; }
        resolve({ status: res.statusCode, headers: res.headers, text, json });
      });
    });
    req.on('error', reject);
    if (body !== undefined) req.write(typeof body === 'string' ? body : JSON.stringify(body));
    req.end();
  });
}

function requestChunks(port, path, options, chunks) {
  return new Promise((resolve, reject) => {
    const req = http.request({
      host: '127.0.0.1', port, path, method: options.method || 'POST', headers: options.headers || {},
    }, (res) => {
      let text = '';
      res.setEncoding('utf8');
      res.on('data', (chunk) => { text += chunk; });
      res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, text, json: text ? JSON.parse(text) : null }));
    });
    req.on('error', reject);
    for (const chunk of chunks) req.write(chunk);
    req.end();
  });
}

const auth = (token = 'a'.repeat(64)) => ({ authorization: `Bearer ${token}` });
const extensionHeaders = (token = 'a'.repeat(64)) => ({ ...auth(token), origin: 'chrome-extension://abcdefghijklmnop' });

let state;
test.beforeEach(async () => { state = await startServer(); });
test.afterEach(() => state.receptor.parar());

test('requires a valid bearer token for ping, including extension origins', async () => {
  const missing = await request(state.port, '/ping', { headers: { origin: 'chrome-extension://abcdefghijklmnop' } });
  assert.equal(missing.status, 401);

  const wrong = await request(state.port, '/ping', { headers: extensionHeaders('b'.repeat(64)) });
  assert.equal(wrong.status, 401);

  const ok = await request(state.port, '/ping', { headers: extensionHeaders() });
  assert.equal(ok.status, 200);
  assert.equal(ok.json.protocol, 1);
  assert.equal(ok.headers['access-control-allow-origin'], 'chrome-extension://abcdefghijklmnop');
});

test('rejects opaque and website origins even with the token', async () => {
  for (const origin of ['null', 'https://evil.example', 'http://127.0.0.1:3000', 'moz-extension://']) {
    const response = await request(state.port, '/ping', { headers: { ...auth(), origin } });
    assert.equal(response.status, 403, origin);
    assert.equal(response.headers['access-control-allow-origin'], undefined);
  }
});

test('allows authenticated originless CLI requests without wildcard CORS', async () => {
  const response = await request(state.port, '/ping', { headers: auth() });
  assert.equal(response.status, 200);
  assert.equal(response.headers['access-control-allow-origin'], undefined);
});

test('preflight allowlists extension origins and authorization', async () => {
  const ok = await request(state.port, '/ping', {
    method: 'OPTIONS',
    headers: {
      origin: 'moz-extension://a1b2c3',
      'access-control-request-method': 'GET',
      'access-control-request-headers': 'authorization, content-type',
    },
  });
  assert.equal(ok.status, 204);
  assert.equal(ok.headers['access-control-allow-origin'], 'moz-extension://a1b2c3');
  assert.match(ok.headers['access-control-allow-headers'], /authorization/i);

  const evil = await request(state.port, '/ping', { method: 'OPTIONS', headers: { origin: 'https://evil.example' } });
  assert.equal(evil.status, 403);
});

test('validates clip and bookmark paths before touching the vault', async () => {
  const traversal = await request(state.port, '/clip', {
    method: 'POST',
    headers: { ...extensionHeaders(), 'content-type': 'application/json' },
  }, { nome: 'nota', pasta: '../.obsidian', conteudo: 'body' });
  assert.equal(traversal.status, 400);
  assert.equal(state.vault.files.size, 0);

  const malformed = await request(state.port, '/x-bookmarks', {
    method: 'POST',
    headers: { ...auth(), 'content-type': 'application/json' },
  }, { pasta: 'Clippings', bookmarks: [{ nome: 'bad/name', conteudo: 'x', source: 'https://x/1' }] });
  assert.equal(malformed.status, 400);
  assert.equal(state.vault.files.size, 0);

  const valid = await request(state.port, '/clip', {
    method: 'POST',
    headers: { ...extensionHeaders(), 'content-type': 'application/json' },
  }, { nome: 'nota', pasta: 'Clippings', conteudo: '---\nsource: "https://x/1"\n---\nbody' });
  assert.equal(valid.status, 200);
  assert.equal(valid.json.ok, true);
  assert.ok(state.vault.files.has('Clippings/nota.md'));
});

test('preserves multibyte clip content when TCP chunks split a UTF-8 sequence', async () => {
  const payload = JSON.stringify({ nome: 'emoji', pasta: 'Clippings', conteudo: '---\nsource: "https://x/emoji"\n---\nOlá 🌉' });
  const bytes = Buffer.from(payload);
  const split = bytes.indexOf(Buffer.from('🌉')) + 2;
  const response = await requestChunks(state.port, '/clip', {
    method: 'POST', headers: { ...extensionHeaders(), 'content-type': 'application/json' },
  }, [bytes.subarray(0, split), bytes.subarray(split)]);
  assert.equal(response.status, 200);
  assert.equal(state.vault.files.get('Clippings/emoji.md').content, '---\nsource: "https://x/emoji"\n---\nOlá 🌉');
});

test('deduplicates concurrent clips even while the metadata cache is stale', async () => {
  const body = { nome: 'same clip', pasta: 'Clippings', conteudo: '---\nsource: "https://x/same"\n---\nbody' };
  const responses = await Promise.all([
    request(state.port, '/clip', { method: 'POST', headers: { ...extensionHeaders(), 'content-type': 'application/json' } }, body),
    request(state.port, '/clip', { method: 'POST', headers: { ...extensionHeaders(), 'content-type': 'application/json' } }, body),
  ]);
  assert.deepEqual(responses.map((r) => r.status), [200, 200]);
  assert.equal([...state.vault.files.keys()].filter((path) => path.endsWith('.md')).length, 1);
  assert.equal(responses.filter((r) => r.json.duplicata).length, 1);
});

test('deduplicates YAML sources and serializes concurrent bookmark writes', async () => {
  const body = {
    pasta: 'Clippings',
    bookmarks: [
      { nome: 'same one', source: 'https://x/1', conteudo: '---\nsource: "https://x/1"\n---\nfirst' },
      { nome: 'same two', source: 'https://x/1', conteudo: '---\nsource: "https://x/1"\n---\nsecond' },
    ],
  };
  const responses = await Promise.all([
    request(state.port, '/x-bookmarks', { method: 'POST', headers: { ...extensionHeaders(), 'content-type': 'application/json' } }, body),
    request(state.port, '/x-bookmarks', { method: 'POST', headers: { ...extensionHeaders(), 'content-type': 'application/json' } }, body),
  ]);
  assert.deepEqual(responses.map((r) => r.status), [200, 200]);
  assert.equal([...state.vault.files.keys()].filter((path) => path.endsWith('.md')).length, 1);
});

test('occupied ports report an error without an undefined variable crash', async () => {
  const held = http.createServer();
  await new Promise((resolve) => held.listen(0, '127.0.0.1', resolve));
  const port = held.address().port;
  const { plugin } = makePlugin(port);
  const receptor = new Receptor(plugin);
  assert.doesNotThrow(() => receptor.iniciar());
  await new Promise((resolve) => setTimeout(resolve, 20));
  receptor.parar();
  await new Promise((resolve) => held.close(resolve));
});

 test('oversized clip receives an explicit 413 without a socket reset or write', async () => {
  const response = await request(state.port, '/clip', {
    method: 'POST', headers: { ...extensionHeaders(), 'content-type': 'application/json' },
  }, { nome: 'large', pasta: 'Clippings', conteudo: 'x'.repeat(17 * 1024 * 1024) });
  assert.equal(response.status, 413);
  assert.equal(state.vault.files.size, 0);
});
