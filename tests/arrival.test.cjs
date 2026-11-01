const test = require("node:test");
const assert = require("node:assert/strict");

const {
  loadMain,
  makeApp,
  makeFile,
  makePlugin,
} = require("./plugin-harness.cjs");

function assertIso(value) {
  assert.equal(typeof value, "string");
  assert.match(value, /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d+)?(?:Z|[+-]\d\d:\d\d)$/);
  assert.ok(Number.isFinite(Date.parse(value)), `expected an ISO timestamp, got ${value}`);
}

function noteBody(source, created, title = "Captured") {
  return [
    "---",
    `title: ${JSON.stringify(title)}`,
    `source: ${JSON.stringify(source)}`,
    `created: ${JSON.stringify(created)}`,
    "tags:",
    '  - "clippings"',
    "---",
    "",
    "The original body stays byte-for-byte intact.",
    "",
  ].join("\n");
}

test("fresh direct links receive immutable arrival metadata without changing source dates or body", async () => {
  const { internals } = loadMain({
    requestUrl: async () => ({
      text: '<html><head><meta property="og:title" content="A fresh link"><meta property="og:description" content="Description"></head></html>',
    }),
  });
  const { app } = makeApp([]);
  const plugin = makePlugin(internals, app);

  const file = await plugin.adicionarLink("https://example.test/fresh");

  assert.ok(file);
  assertIso(file.frontmatter.corebrain_added_at);
  assert.match(file.body, /created: \d{4}-\d\d-\d\d/);
  assert.match(file.body, /\[A fresh link\]\(https:\/\/example\.test\/fresh\)/);
  assert.equal(file.frontmatter.created, undefined, "arrival must not replace the source date");
});

test("fresh bridge clip and X bookmark receive arrival metadata while existing YAML survives", async () => {
  const { internals } = loadMain();
  const { app } = makeApp([]);
  const plugin = makePlugin(internals, app);
  const receptor = new internals.Receptor(plugin);
  const clipSource = "https://example.test/clip";
  const bookmarkSource = "https://example.test/bookmark";
  const clipBody = noteBody(clipSource, "2026-09-17", "Clip");
  const bookmarkBody = noteBody(bookmarkSource, "2026-09-16", "Bookmark");

  const clipResult = await receptor._gravarClip({ nome: "Clip", conteudo: clipBody });
  const bookmarkResult = await receptor._gravar([
    { nome: "Bookmark", source: bookmarkSource, conteudo: bookmarkBody },
  ], "Clippings");
  const clip = app.vault.getAbstractFileByPath(clipResult.caminho);
  const bookmark = app.vault.getAbstractFileByPath("Clippings/Bookmark.md");

  assert.equal(clipResult.duplicata, false);
  assert.equal(bookmarkResult.criados, 1);
  assertIso(clip.frontmatter.corebrain_added_at);
  assertIso(bookmark.frontmatter.corebrain_added_at);
  assert.match(clip.body, /created: "2026-09-17"/);
  assert.match(bookmark.body, /created: "2026-09-16"/);
  assert.match(clip.body, /The original body stays byte-for-byte intact\./);
  assert.match(bookmark.body, /The original body stays byte-for-byte intact\./);
});

test("duplicates are untouched and repeated arrival registration preserves the first timestamp", async () => {
  const { internals } = loadMain();
  const originalArrival = "2026-09-01T12:34:56.789Z";
  const existing = makeFile("Clippings/existing.md", {
    source: "https://example.test/duplicate",
    corebrain_added_at: originalArrival,
  }, noteBody("https://example.test/duplicate", "2026-09-01", "Existing"));
  const { app, files } = makeApp([existing]);
  const plugin = makePlugin(internals, app);
  const receptor = new internals.Receptor(plugin);

  const clip = await receptor._gravarClip({
    nome: "Duplicate",
    conteudo: noteBody("https://example.test/duplicate", "2026-09-18", "Duplicate"),
  });
  assert.equal(clip.duplicata, true);
  assert.equal(files.length, 1);
  assert.equal(existing.frontmatter.corebrain_added_at, originalArrival);

  const beforeEdit = existing.frontmatter.corebrain_added_at;
  await app.fileManager.processFrontMatter(existing, (fm) => { fm.title = "Edited later"; });
  await plugin.registrarChegada(existing);
  assert.equal(existing.frontmatter.corebrain_added_at, beforeEdit);
  assert.equal(existing.frontmatter.title, "Edited later");
});

test("valid arrival metadata in a newly captured note is preserved exactly", async () => {
  const { internals } = loadMain();
  const originalArrival = "2026-09-02T03:04:05Z";
  const { app } = makeApp([]);
  const plugin = makePlugin(internals, app);
  const receptor = new internals.Receptor(plugin);
  const body = [
    "---",
    'title: "Already stamped"',
    'source: "https://example.test/already-stamped"',
    `corebrain_added_at: "${originalArrival}"`,
    'created: "2026-09-02"',
    "---",
    "",
    "body",
    "",
  ].join("\n");

  const result = await receptor._gravarClip({ nome: "Already stamped", conteudo: body });
  const file = app.vault.getAbstractFileByPath(result.caminho);

  assert.equal(file.frontmatter.corebrain_added_at, originalArrival);
  assert.match(file.body, new RegExp(`corebrain_added_at: "${originalArrival}"`));
});

test("startup does not rewrite legacy notes, while a genuinely new vault create is stamped", async () => {
  const { internals } = loadMain();
  const legacy = makeFile("Clippings/legacy.md", { title: "Legacy" }, "---\ntitle: Legacy\n---\nold\n");
  const { app } = makeApp([legacy]);
  const plugin = makePlugin(internals, app);
  plugin.loadData = async () => ({ ...internals.PADRAO, capaLocal: false });

  await plugin.onload();
  app.vault.emit("create", legacy); // Simulates a startup enumeration event.
  await Promise.resolve();
  assert.equal(legacy.frontmatter.corebrain_added_at, undefined);

  app.workspace.emitLayoutReady();
  app.vault.emit("create", legacy); // The same TFile remains a startup note.
  await Promise.resolve();
  assert.equal(legacy.frontmatter.corebrain_added_at, undefined);

  const fresh = await app.vault.create("Clippings/from-uri.md", "---\ntitle: URI\n---\nbody\n");
  await Promise.resolve();
  assertIso(fresh.frontmatter.corebrain_added_at);
  assert.equal(legacy.frontmatter.corebrain_added_at, undefined);

  app.vault.emit("delete", legacy);
  const recreated = await app.vault.create("Clippings/legacy.md", "---\ntitle: Legacy recreated\n---\nbody\n");
  await Promise.resolve();
  assertIso(recreated.frontmatter.corebrain_added_at);
});

test("P5 failed X arrival stamp is recovered on the next sync without rewriting legacy notes", async () => {
  const { internals } = loadMain();
  const legacy = makeFile("Clippings/legacy.md", { title: "Legacy" }, "---\ntitle: Legacy\n---\n");
  const { app } = makeApp([legacy]);
  const plugin = makePlugin(internals, app);
  const original = app.fileManager.processFrontMatter;
  let fail = true;
  app.fileManager.processFrontMatter = async (file, fn) => {
    if (file.path === "Clippings/Retry.md" && fail) { fail = false; throw new Error("disk error"); }
    return original(file, fn);
  };
  const receptor = new internals.Receptor(plugin);
  const source = "https://x.com/user/status/123";
  const bookmarks = [{ nome: "Retry", source, conteudo: noteBody(source, "2026-01-01") }];
  const first = await receptor._gravar(bookmarks, "Clippings");
  assert.equal(first.criados, 0);
  assert.equal(first.erros, 1);
  const second = await receptor._gravar(bookmarks, "Clippings");
  assert.equal(second.pulados, 1);
  assertIso(app.vault.getAbstractFileByPath("Clippings/Retry.md").frontmatter.corebrain_added_at);
  assert.equal(legacy.frontmatter.corebrain_added_at, undefined);
});

test("P5 startup retries only persisted pending arrivals", async () => {
  const { internals } = loadMain();
  const pending = makeFile("Clippings/pending.md", {}, "---\nsource: https://example.com/pending\n---\n");
  const legacy = makeFile("Clippings/legacy.md", {}, "---\nsource: https://example.com/legacy\n---\n");
  const { app } = makeApp([pending, legacy]);
  const plugin = makePlugin(internals, app);
  plugin.loadData = async () => ({ capaLocal: false, carimbosPendentes: [pending.path] });
  await plugin.onload();
  app.workspace.emitLayoutReady();
  await new Promise((resolve) => setImmediate(resolve));
  assertIso(pending.frontmatter.corebrain_added_at);
  assert.equal(legacy.frontmatter.corebrain_added_at, undefined);
  assert.deepEqual([...plugin.cfg.carimbosPendentes], []);
});

test("failed arrival pending path follows a rename and is stamped on retry", async () => {
  const { internals } = loadMain();
  const { app, stored } = makeApp();
  const plugin = makePlugin(internals, app);
  let fail = true;
  const original = app.fileManager.processFrontMatter;
  app.fileManager.processFrontMatter = async (file, fn) => {
    if (fail && file.path === "Clippings/Retry.md") {
      fail = false;
      throw new Error("disk error");
    }
    return original(file, fn);
  };
  await plugin.onload();
  const receptor = new internals.Receptor(plugin);
  const source = "https://x.com/user/status/rename-retry";
  const bookmarks = [{ nome: "Retry", source, conteudo: noteBody(source, "2026-01-01") }];
  const first = await receptor._gravar(bookmarks, "Clippings");
  assert.equal(first.erros, 1);
  assert.equal(plugin.cfg.carimbosPendentes?.length, 1);
  assert.equal(plugin.cfg.carimbosPendentes[0], "Clippings/Retry.md");

  const file = app.vault.getAbstractFileByPath("Clippings/Retry.md");
  stored.delete(file.path);
  file.path = "Clippings/Renamed.md";
  stored.set(file.path, file);
  app.vault.emit("rename", file, "Clippings/Retry.md");
  for (let i = 0; i < 20 && plugin.cfg.carimbosPendentes[0] !== "Clippings/Renamed.md"; i++) {
    await new Promise((resolve) => setImmediate(resolve));
  }

  const second = await receptor._gravar(bookmarks, "Clippings");
  assert.equal(second.pulados, 1);
  assert.equal(second.criados, 0);
  assertIso(app.vault.getAbstractFileByPath("Clippings/Renamed.md").frontmatter.corebrain_added_at);
  assert.equal(app.vault.getAbstractFileByPath("Clippings/Retry.md"), null);
  assert.deepEqual([...(plugin.cfg.carimbosPendentes || [])], []);
});

test("pending arrival remap does not treat a path prefix as a sibling folder", async () => {
  const { internals } = loadMain();
  const { app } = makeApp();
  const plugin = makePlugin(internals, app);
  plugin.cfg.carimbosPendentes = [
    "Clippings/Pasta/nota.md",
    "Clippings/PastaExtra/nota.md",
    "Clippings/Pasta.md",
  ];
  plugin.cfg.buscas = {
    leitura: { pedido: "leitura", criada: "2026-09-18", caminhos: ["Clippings/other.md"] },
  };

  const changed = await plugin.atualizarBuscasRenomeada({ path: "Clippings/Nova" }, "Clippings/Pasta");

  assert.equal(changed, true);
  assert.deepEqual([...plugin.cfg.carimbosPendentes], [
    "Clippings/Nova/nota.md",
    "Clippings/PastaExtra/nota.md",
    "Clippings/Pasta.md",
  ]);
  assert.deepEqual([...plugin.cfg.buscas.leitura.caminhos], ["Clippings/other.md"]);
});
