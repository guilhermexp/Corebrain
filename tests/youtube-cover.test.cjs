const test = require('node:test');
const assert = require('node:assert/strict');
const { loadMain, makeApp, makePlugin } = require('./plugin-harness.cjs');

test('YouTube covers do not depend on the rate-limited watch page', async () => {
  let requests = 0;
  const { internals } = loadMain({ httpsModule: { request: () => { requests++; throw new Error('unexpected request'); } } });
  const plugin = makePlugin(internals, makeApp([]).app);
  for (const url of [
    'https://www.youtube.com/watch?v=tTnUcSj-QPA&t=10s',
    'https://youtu.be/tTnUcSj-QPA?si=abc',
    'https://m.youtube.com/shorts/tTnUcSj-QPA',
    'https://www.youtube.com/embed/tTnUcSj-QPA',
    'https://youtube.com/live/tTnUcSj-QPA',
  ]) assert.equal(await plugin.buscarCapa(url), 'https://i.ytimg.com/vi/tTnUcSj-QPA/hqdefault.jpg');
  assert.equal(requests, 0);
});

test('non-video and lookalike URLs retain OpenGraph discovery', async () => {
  const requested = [];
  const { EventEmitter } = require('node:events');
  const httpsModule = { request(url, _options, callback) {
    const req = new EventEmitter();
    req.end = () => {
      requested.push(url.href);
      const response = new EventEmitter();
      response.statusCode = 200;
      response.headers = {};
      callback(response);
      response.emit('data', Buffer.from('<meta property="og:image" content="/cover.jpg">'));
      response.emit('end');
      req.emit('close');
    };
    return req;
  } };
  const { internals } = loadMain({ httpsModule });
  const plugin = makePlugin(internals, makeApp([]).app);
  for (const url of ['https://notyoutube.com/watch?v=tTnUcSj-QPA', 'https://youtube.com/@channel', 'https://youtube.com/watch?v=bad', 'https://example.com/article']) {
    assert.equal(await plugin.buscarCapa(url), new URL('/cover.jpg',url).href);
  }
  assert.equal(requested.length,4);
});
