const test = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const { loadMain, makeApp, makeFile, makePlugin } = require('./plugin-harness.cjs');

function transport(responses, connected) {
  return {
    createServer: () => ({ on() {}, listen() {}, close() {} }),
    request(url, options, callback) {
      const req = new EventEmitter();
      req.destroy = (error) => { req.emit('error', error); req.emit('close'); };
      req.end = () => options.lookup(url.hostname, {}, (error) => {
        if (error) return req.destroy(error);
        connected.push(url.href);
        const response = responses[url.href];
        const res = new EventEmitter();
        res.statusCode = response.status;
        res.headers = response.headers || {};
        callback(res);
        if (response.body) res.emit('data', Buffer.from(response.body));
        res.emit('end');
        req.emit('close');
      });
      return req;
    },
  };
}

test('P1 DNS and redirects are validated before connecting', async () => {
  const connected = [];
  const responses = { 'http://public.example/redirect': { status: 302, headers: { location: 'http://127.0.0.1/private' } } };
  const httpModule = transport(responses, connected);
  const dnsModule = { lookup: (host, _options, cb) => cb(null, [{ address: host === 'private.example' ? '10.0.0.5' : '93.184.216.34', family: 4 }]) };
  const { internals } = loadMain({ httpModule, dnsModule });
  const plugin = makePlugin(internals, makeApp().app);
  assert.equal(await plugin.baixarBytes('http://private.example/image', 0), null);
  assert.equal(await plugin.baixarBytes('http://public.example/redirect', 0), null);
  assert.equal(await plugin.baixarBytes('file:///etc/passwd', 0), null);
  assert.deepEqual(connected, ['http://public.example/redirect']);
  for (const ip of ['0.1.2.3', '10.0.0.5', '100.64.1.1', '127.0.0.1', '169.254.1.1', '172.16.1.1', '192.168.1.1', '224.0.0.1', '240.0.0.1', '::', '::1', 'fc00::1', 'fe80::1', 'ff00::1', '::ffff:10.0.0.5']) assert.equal(internals.ipBloqueado(ip), true, ip);
  assert.equal(internals.ipBloqueado('93.184.216.34'), false);
});

test('P1 public cover is decoded and stored in the vault', async () => {
  const connected = [];
  const image = Buffer.alloc(128, 1);
  const httpModule = transport({ 'http://public.example/image.jpg': { status: 200, body: image } }, connected);
  const dnsModule = { lookup: (_host, _options, cb) => cb(null, [{ address: '93.184.216.34', family: 4 }]) };
  const { internals } = loadMain({ httpModule, dnsModule, imageBitmap: async () => ({ width: 100, height: 100 }) });
  const file = makeFile('Clippings/cover.md', { source: 'https://example.com/page', image: 'http://public.example/image.jpg' });
  const { app, binary } = makeApp([file]);
  const plugin = makePlugin(internals, app);
  assert.equal(await plugin.baixarCapa(file), 'ok');
  assert.ok(binary.has(file.frontmatter.thumb));
  assert.deepEqual(connected, ['http://public.example/image.jpg']);
});


test('P1 public page cannot cause a private og:image connection', async () => {
  const connected = [];
  const html = '<meta property="og:image" content="http://192.168.0.1/image">';
  const httpModule = transport({ 'http://public.example/page': { status: 200, body: html } }, connected);
  const dnsModule = { lookup: (_host, _options, cb) => cb(null, [{ address: '93.184.216.34', family: 4 }]) };
  const { internals } = loadMain({ httpModule, dnsModule });
  const file = makeFile('Clippings/page.md', { source: 'http://public.example/page' });
  const { app, binary } = makeApp([file]);
  const plugin = makePlugin(internals, app);
  assert.equal(await plugin.baixarCapa(file), 'falhou');
  assert.deepEqual(connected, ['http://public.example/page']);
  assert.equal(binary.size, 0);
});

test('P1 GIF signature is accepted without a decoder', async () => {
  const { internals } = loadMain();
  const file = makeFile('Clippings/gif.md', { source: 'https://example.com/page', image: 'https://example.com/image' });
  const { app, binary } = makeApp([file]);
  const plugin = makePlugin(internals, app);
  plugin.baixarBytes = async () => Buffer.concat([Buffer.from('GIF89a'), Buffer.alloc(122)]);
  assert.equal(await plugin.baixarCapa(file), 'ok');
  assert.match(file.frontmatter.thumb, /\.gif$/);
  assert.ok(binary.has(file.frontmatter.thumb));
});

test('P1 resolves relative OpenGraph image against the final redirected page', async () => {
  const connected = [];
  const httpModule = transport({
    'http://public.example/page': { status: 302, headers: { location: 'http://other.example/articles/page' } },
    'http://other.example/articles/page': { status: 200, body: '<meta property="og:image" content="cover.jpg">' },
  }, connected);
  const dnsModule = { lookup: (_host, _options, cb) => cb(null, [{ address: '93.184.216.34', family: 4 }]) };
  const { internals } = loadMain({ httpModule, dnsModule });
  const plugin = makePlugin(internals, makeApp().app);
  assert.equal(await plugin.buscarCapa('http://public.example/page'), 'http://other.example/articles/cover.jpg');
});