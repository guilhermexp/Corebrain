const test = require("node:test");
const assert = require("node:assert/strict");

const { loadMain, makeApp, makeFile, makePlugin } = require("./plugin-harness.cjs");

function bookmark(source, nome = "Instagram post", image = "") {
  return {
    nome,
    source,
    conteudo: [
      "---",
      `title: ${JSON.stringify(nome)}`,
      `source: ${JSON.stringify(source)}`,
      ...(image ? [`image: ${JSON.stringify(image)}`] : []),
      "---",
      `Conteúdo de ${nome}`,
      "",
    ].join("\n"),
  };
}

function fakeRequest(receptor, { method = "POST", path = "/instagram-saved", headers = {}, body } = {}) {
  const listeners = {};
  const req = {
    method,
    url: path,
    headers,
    setEncoding() {},
    on(event, listener) { listeners[event] = listener; return this; },
  };
  const res = {
    writableEnded: false,
    writeHead(status, responseHeaders) { this.status = status; this.headers = responseHeaders; },
    end(text) { this.body = text; this.writableEnded = true; },
  };
  receptor.tratar(req, res);
  if (!res.writableEnded) {
    listeners.data(JSON.stringify(body));
    return Promise.resolve(listeners.end()).then(() => ({
      status: res.status,
      headers: res.headers,
      json: res.body ? JSON.parse(res.body) : null,
    }));
  }
  return Promise.resolve({ status: res.status, headers: res.headers, json: JSON.parse(res.body) });
}

test("Instagram shortcode aliases deduplicate exactly while preserving case and rejecting lookalike hosts", async () => {
  const { internals } = loadMain();
  const canonical = "https://www.instagram.com/reel/Ab_C/?igsh=first";
  const originalBody = bookmark(canonical, "Saved with original URL").conteudo;
  const original = makeFile("Clippings/original.md", { source: canonical }, originalBody);
  const { app, files } = makeApp([original]);
  const plugin = makePlugin(internals, app);
  const receptor = new internals.Receptor(plugin);

  assert.equal(plugin.notaComSource("https://instagram.com/p/Ab_C/"), original);
  assert.equal(plugin.notaComSource("https://instagram.com.evil.example/p/Ab_C/"), null);

  const incoming = [
    bookmark("https://instagram.com/p/Ab_C/", "Post alias"),
    bookmark("https://m.instagram.com/reels/Ab_C/?source=share", "Reels alias"),
    bookmark("https://instagram.com/p/ab_C/", "Different shortcode case"),
    bookmark("https://instagram.com.evil.example/p/Ab_C/", "Lookalike host"),
    bookmark("https://foo.instagram.com/p/Ab_C/", "Subdomain lookalike"),
  ];
  const result = await receptor._gravar(incoming, "Clippings", "instagram");

  assert.deepEqual({ ...result }, { criados: 3, pulados: 2, erros: 0 });
  assert.equal(files.length, 4);
  assert.match(files.find((file) => file.basename === "Different shortcode case").body, /https:\/\/instagram\.com\/p\/ab_C\//);
  assert.match(files.find((file) => file.basename === "Lookalike host").body, /https:\/\/instagram\.com\.evil\.example\/p\/Ab_C\//);
  assert.equal(original.body, originalBody, "the original note and source URL must remain byte-for-byte unchanged");
});

test("authenticated /instagram-saved route accepts the X batch envelope and enforces its bounds", async () => {
  const { internals, notices } = loadMain();
  const { app, files } = makeApp([]);
  const plugin = makePlugin(internals, app);
  plugin.cfg.ponteToken = "test-pairing-token";
  const receptor = new internals.Receptor(plugin);
  const payload = {
    pasta: "Clippings",
    bookmarks: [bookmark("https://www.instagram.com/reels/Short_01/", "Saved")],
  };

  const unauthorized = await fakeRequest(receptor, { body: payload });
  assert.equal(unauthorized.status, 401);
  assert.equal(files.length, 0);

  const accepted = await fakeRequest(receptor, {
    headers: { authorization: "Bearer test-pairing-token", origin: "chrome-extension://test" },
    body: payload,
  });
  assert.equal(accepted.status, 200);
  assert.deepEqual(accepted.json, { criados: 1, pulados: 0, erros: 0 });
  assert.equal(files.length, 1);
  assert.ok(notices.some((notice) => /Instagram/.test(notice.message)));
  assert.ok(notices.every((notice) => !/Bookmarks do X/.test(notice.message)));

  const replay = await fakeRequest(receptor, {
    headers: { authorization: "Bearer test-pairing-token" },
    body: payload,
  });
  assert.equal(replay.status, 200);
  assert.deepEqual(replay.json, { criados: 0, pulados: 1, erros: 0 });
  assert.equal(files.length, 1);

  const oversized = await fakeRequest(receptor, {
    headers: { authorization: "Bearer test-pairing-token" },
    body: { bookmarks: Array.from({ length: 10001 }, () => ({})) },
  });
  assert.equal(oversized.status, 400);
  assert.equal(oversized.json.erro, "bookmarks demais");
  assert.equal(files.length, 1, "an over-bound batch must not touch the vault");
});

test("replaying an Instagram batch skips aliases without rewriting existing note bytes or arrival stamps", async () => {
  const { internals } = loadMain();
  const source = "https://www.instagram.com/p/Replay_42/?igsh=old";
  const originalBody = bookmark(source, "Existing", "https://scontent.cdninstagram.com/p/old.jpg").conteudo +
    'corebrain_added_at: "2026-09-20T10:11:12.000Z"\n';
  const existing = makeFile("Clippings/existing.md", {
    source,
    corebrain_added_at: "2026-09-20T10:11:12.000Z",
  }, originalBody);
  const { app, files } = makeApp([existing]);
  const plugin = makePlugin(internals, app);
  const receptor = new internals.Receptor(plugin);
  const batch = [bookmark("https://instagram.com/reel/Replay_42/", "Alias")];

  const first = await receptor._gravar(batch, "Clippings", "instagram");
  const second = await receptor._gravar(batch, "Clippings", "instagram");
  assert.deepEqual({ ...first }, { criados: 0, pulados: 1, erros: 0 });
  assert.deepEqual({ ...second }, { criados: 0, pulados: 1, erros: 0 });
  assert.equal(files.length, 1);
  assert.equal(existing.body, originalBody);
  assert.equal(existing.frontmatter.corebrain_added_at, "2026-09-20T10:11:12.000Z");
});

test("Instagram destructive duplicate cleanup requires full canonical source-set equality", async () => {
  const { internals } = loadMain();
  const shortcode = "https://www.instagram.com/p/Shared_9/";
  const alias = "https://instagram.com/reels/Shared_9/?utm=alias";
  const original = makeFile("Clippings/original.md", {
    source: [shortcode, "https://example.com/also-source"],
  });
  const partialOverlap = makeFile("Clippings/partial.md", {
    source: [alias, "https://example.com/also-source", "https://example.com/extra"],
  });
  const equalSet = makeFile("Clippings/equal-set.md", {
    source: ["https://example.com/also-source", alias],
  });
  original.stat.ctime -= 2000;
  partialOverlap.stat.ctime -= 1000;
  const plugin = makePlugin(internals, makeApp([original, partialOverlap, equalSet]).app);

  assert.deepEqual([...plugin.duplicatas().map((file) => file.path)], [equalSet.path]);
});

test("Instagram import persists oldest-first so the gallery keeps newest-first order", async () => {
  const fixedTime = Date.parse("2026-09-26T12:00:00.000Z");
  class FixedDate extends Date {
    constructor(...args) { super(...(args.length ? args : [fixedTime])); }
    static now() { return fixedTime; }
  }
  const { internals } = loadMain({ DateImpl: FixedDate });
  const { app } = makeApp([]);
  const plugin = makePlugin(internals, app);
  const receptor = new internals.Receptor(plugin);

  const result = await receptor._gravar([
    bookmark("https://instagram.com/p/Newest_1/", "newest"),
    bookmark("https://instagram.com/reel/Middle_2/", "middle"),
    bookmark("https://instagram.com/reels/Oldest_3/", "oldest"),
  ], "Clippings", "instagram");

  assert.deepEqual({ ...result }, { criados: 3, pulados: 0, erros: 0 });
  assert.deepEqual(
    ["oldest", "middle", "newest"].map((title) => app.vault.getAbstractFileByPath(`Clippings/${title}.md`).frontmatter.corebrain_added_at),
    [
      "2026-09-26T12:00:00.000Z",
      "2026-09-26T12:00:00.001Z",
      "2026-09-26T12:00:00.002Z",
    ],
  );
});

test("untrusted Instagram image URLs are rejected before network access", async () => {
  const calls = [];
  const { internals } = loadMain({ requestUrl: async (options) => {
    calls.push(options.url);
    return { status: 200, arrayBuffer: new Uint8Array(128).buffer, text: "" };
  } });
  const { app } = makeApp([]);
  const plugin = makePlugin(internals, app);
  const file = makeFile("Clippings/untrusted.md", {
    source: "https://www.instagram.com/p/Private_1/",
    image: "http://127.0.0.1/private.png",
  });
  plugin._instagramSavedPaths = new Set([file.path]);

  assert.equal(await plugin.baixarCapa(file), "bloqueado");
  assert.deepEqual(calls, []);
});

test("metadata changes on an existing Instagram note do not queue or rewrite a cover", async () => {
  const calls = [];
  const { internals } = loadMain({ requestUrl: async (options) => {
    calls.push(options.url);
    return { status: 200, arrayBuffer: new Uint8Array(128).buffer, text: "" };
  } });
  const originalBody = "---\nsource: https://www.instagram.com/p/OldSaved_1/\nimage: https://scontent.cdninstagram.com/old.jpg\n---\nold note\n";
  const existing = makeFile("Clippings/old-ig.md", {
    source: "https://www.instagram.com/p/OldSaved_1/",
    image: "https://scontent.cdninstagram.com/old.jpg",
  }, originalBody);
  const { app } = makeApp([existing]);
  const plugin = makePlugin(internals, app);

  await plugin.thumb(existing, { frontmatter: existing.frontmatter });
  assert.deepEqual(calls, []);
  assert.equal(plugin._instagramCoverDrain, undefined);
  assert.equal(existing.body, originalBody);
  assert.equal(existing.frontmatter.thumb, undefined);
});

test("disabled local covers are respected for newly imported Instagram notes", async () => {
  const calls = [];
  const { internals } = loadMain({ requestUrl: async (options) => {
    calls.push(options.url);
    return { status: 200, arrayBuffer: new Uint8Array(128).buffer, text: "" };
  } });
  const { app } = makeApp([]);
  const plugin = makePlugin(internals, app);
  plugin.cfg.capaLocal = false;
  const receptor = new internals.Receptor(plugin);
  const image = "https://scontent.cdninstagram.com/v/t51/disabled.jpg";
  await receptor._gravar([
    bookmark("https://www.instagram.com/p/NoLocal_2/", "Local disabled", image),
  ], "Clippings", "instagram");
  const file = app.vault.getAbstractFileByPath("Clippings/Local disabled.md");
  file.frontmatter = { source: "https://www.instagram.com/p/NoLocal_2/", image };

  await plugin.thumb(file, { frontmatter: file.frontmatter });
  assert.deepEqual(calls, []);
  assert.equal(plugin._instagramCoverDrain, undefined);
  assert.ok(file, "cover preferences must not affect clipping creation");
});

test("a failed Instagram cover is a warning and never removes the successfully created clipping", async () => {
  const calls = [];
  const { internals, notices } = loadMain({ requestUrl: async (options) => {
    calls.push(options.url);
    return { status: 403, arrayBuffer: null, text: "" };
  } });
  const { app, files } = makeApp([]);
  const plugin = makePlugin(internals, app);
  const receptor = new internals.Receptor(plugin);
  const image = "https://scontent.cdninstagram.com/v/t51/signed.jpg?token=expired";

  const result = await receptor._gravar([
    bookmark("https://www.instagram.com/p/CoverFail_3/", "Cover survives", image),
  ], "Clippings", "instagram");
  const file = app.vault.getAbstractFileByPath("Clippings/Cover survives.md");
  file.frontmatter = {
    source: "https://www.instagram.com/p/CoverFail_3/",
    image,
    corebrain_added_at: file.frontmatter.corebrain_added_at,
  };
  assert.deepEqual({ ...result }, { criados: 1, pulados: 0, erros: 0 });
  assert.ok(file, "a clipping should remain after it has been created");

  // The plugin invokes thumb() for the metadata-cache change after stamping a
  // new note. The harness doesn't run onload, so exercise that existing hook.
  await plugin.thumb(file, { frontmatter: file.frontmatter });
  if (plugin._instagramCoverDrain) await plugin._instagramCoverDrain;

  assert.deepEqual(calls, [image], "failed IG CDN fetch must not fall back to fetching the post page");
  assert.equal(files.length, 1);
  assert.equal(file.frontmatter.thumb, undefined);
  assert.ok(notices.some((notice) => /capa.*instagram|instagram.*capa/i.test(notice.message)));

  await plugin.thumb(file, { frontmatter: file.frontmatter });
  assert.equal(calls.length, 1, "one failed optional cover must not be retried on every metadata change");
});
