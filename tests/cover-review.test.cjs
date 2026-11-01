const test = require('node:test');
const assert = require('node:assert/strict');
const { loadMain, makeApp, makeFile, makePlugin } = require('./plugin-harness.cjs');

test('P1 cover fetch refuses loopback without opening a connection', async () => {
  let calls = 0;
  const httpModule = { request: () => { calls++; throw new Error('unexpected request'); } };
  const { internals } = loadMain({ httpModule });
  const plugin = makePlugin(internals, makeApp().app);
  assert.equal(await plugin.baixarBytes('http://127.0.0.1:1/image.jpg', 0), null);
  assert.equal(calls, 0);
});

test('P1 non-image response is never written as a cover', async () => {
  const { internals } = loadMain();
  const file = makeFile('Clippings/a.md', { source: 'https://example.com/a', image: 'https://example.com/a.gif' });
  const { app, binary } = makeApp([file]);
  const plugin = makePlugin(internals, app);
  plugin.baixarBytes = async () => Buffer.from('<html>not an image</html>');
  const result = await plugin.baixarCapa(file);
  assert.equal(result, 'falhou');
  assert.equal(binary.size, 0);
});

test('P2 Instagram imports without images are permanent results', async () => {
  const { internals } = loadMain();
  const file = makeFile('Clippings/a.md', { source: 'https://instagram.com/p/abc/' });
  const plugin = makePlugin(internals, makeApp([file]).app);
  plugin._instagramSavedPaths = new Set([file.path]);
  assert.equal(await plugin.baixarCapa(file), 'sem imagem');
});

test('P2 background skips 25 permanent failures and reaches the next cover', async () => {
  const { FakeClock } = require('./plugin-harness.cjs');
  const clock = new FakeClock();
  const { internals } = loadMain({ clock });
  const files = Array.from({ length: 26 }, (_, i) => makeFile(`Clippings/${i}.md`, {
    source: `https://instagram.com/p/Post${i}/`,
    ...(i === 25 ? { image: 'https://scontent.cdninstagram.com/valid.jpg' } : {}),
  }));
  const { app } = makeApp(files);
  const plugin = makePlugin(internals, app);
  const original = plugin.baixarCapa.bind(plugin);
  const seen = [];
  plugin.baixarCapa = async (file) => {
    seen.push(file.path);
    return file === files[25] ? 'ok' : original(file);
  };
  plugin.completarCapasDeFundo();
  for (let i = 0; i < 200 && !seen.includes(files[25].path); i++) {
    clock.runNext();
    for (let j = 0; j < 10; j++) await Promise.resolve();
  }
  assert.ok(seen.includes(files[25].path));
  for (const file of files.slice(0, 25)) assert.equal(seen.filter((path) => path === file.path).length, 1);
});

test('P2 transient failures remain retryable without starving later covers', async () => {
  const { FakeClock } = require('./plugin-harness.cjs');
  const clock = new FakeClock();
  const { internals } = loadMain({ clock });
  const files = Array.from({ length: 26 }, (_, i) => makeFile(`Clippings/fail${i}.md`, {
    source: `https://example.com/${i}`, image: 'https://example.com/image.jpg',
  }));
  const plugin = makePlugin(internals, makeApp(files).app);
  const seen = [];
  plugin.baixarCapa = async (file) => { seen.push(file.path); return file === files[25] ? 'ok' : 'falhou'; };
  plugin.completarCapasDeFundo();
  for (let i = 0; i < 200 && !seen.includes(files[25].path); i++) {
    clock.runNext();
    for (let j = 0; j < 10; j++) await Promise.resolve();
  }
  assert.ok(seen.includes(files[25].path));
});

test('P3 unload cancels queued and in-flight Instagram cover writes', async () => {
  const { internals } = loadMain();
  const files = ['a', 'b'].map((n) => makeFile(`Clippings/${n}.md`, { source: `https://instagram.com/p/${n}/`, image: 'https://scontent.cdninstagram.com/a.jpg' }));
  const { app, binary } = makeApp(files);
  const plugin = makePlugin(internals, app);
  await plugin.onload();
  plugin._instagramSavedPaths = new Set(files.map((f) => f.path));
  let finish, downloads = 0, writes = 0;
  plugin.baixarBytes = () => { downloads++; return downloads === 1 ? new Promise((resolve) => { finish = resolve; }) : Promise.resolve(new Uint8Array(128).buffer); };
  plugin.encolher = async (bytes) => ({ dados: bytes, ext: 'jpg' });
  app.fileManager.processFrontMatter = async () => { writes++; };
  plugin.enfileirarCapaInstagram(files[0]);
  plugin.enfileirarCapaInstagram(files[1]);
  const drain = plugin._instagramCoverDrain;
  for (const dispose of plugin._registrations) if (typeof dispose === 'function') dispose();
  finish(new Uint8Array(128).buffer);
  await drain;
  assert.equal(downloads, 1);
  assert.equal(binary.size, 0);
  assert.equal(writes, 0);
});

test('P4 newly created normal Instagram clip receives a local cover', async () => {
  const { internals } = loadMain();
  const { app } = makeApp();
  const plugin = makePlugin(internals, app);
  await plugin.onload();
  app.workspace.emitLayoutReady();
  const receptor = new internals.Receptor(plugin);
  const source = 'https://instagram.com/p/NewPost/';
  const result = await receptor._gravarClip({ nome: 'new', conteudo: `---\nsource: ${source}\n---\nbody` });
  const file = app.vault.getAbstractFileByPath(result.caminho);
  file.frontmatter.source = source;
  file.frontmatter.image = 'https://scontent.cdninstagram.com/a.jpg';
  plugin.baixarBytes = async () => new Uint8Array(128).buffer;
  plugin.encolher = async (bytes) => ({ dados: bytes, ext: 'jpg' });
  await plugin.thumb(file, { frontmatter: file.frontmatter });
  if (plugin._instagramCoverDrain) await plugin._instagramCoverDrain;
  for (const dispose of plugin._registrations) if (typeof dispose === 'function') dispose();
  assert.ok(file.frontmatter.thumb);
});
