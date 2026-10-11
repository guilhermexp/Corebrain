const test = require("node:test");
const assert = require("node:assert/strict");

const { loadMain, makeApp, makeFile, makePlugin } = require("./plugin-harness.cjs");

const fixedTime = Date.parse("2026-09-26T12:00:00.000Z");
class FixedDate extends Date {
  constructor(...args) {
    super(...(args.length ? args : [fixedTime]));
  }
  static now() { return fixedTime; }
}

function bookmark(source, title, arrival) {
  return {
    nome: title,
    source,
    conteudo: [
      "---",
      `title: ${JSON.stringify(title)}`,
      `source: ${JSON.stringify(source)}`,
      ...(arrival ? [`corebrain_added_at: ${JSON.stringify(arrival)}`] : []),
      "---",
      `body for ${title}`,
      "",
    ].join("\n"),
  };
}

test("X bookmark sync preserves newest-first gallery order and doesn't touch existing arrivals", async () => {
  const { internals } = loadMain({ DateImpl: FixedDate });
  const originalArrival = "2026-01-02T03:04:05.678Z";
  const existingBody = bookmark("https://x.com/old/status/99", "already-here", originalArrival).conteudo;
  const existing = makeFile("Clippings/already-here.md", {
    title: "already-here",
    source: "https://x.com/old/status/99",
    corebrain_added_at: originalArrival,
  }, existingBody);
  const { app, files } = makeApp([existing]);
  const plugin = makePlugin(internals, app);
  const receptor = new internals.Receptor(plugin);
  // X returns newest -> oldest. The second alias repeats the first post and
  // must not replace the first occurrence, even though persistence is reversed.
  const batch = [
    bookmark("https://x.com/current/status/42", "z-newest"),
    bookmark("https://x.com/old/status/99", "duplicate-existing"),
    bookmark("https://twitter.com/renamed/status/42?s=20", "a-duplicate-alias"),
    bookmark("https://x.com/u/status/43", "m-middle"),
    bookmark("https://x.com/u/status/44", "a-oldest"),
  ];

  const first = await receptor.gravar(batch, "Clippings");
  assert.deepEqual({ ...first }, { criados: 3, pulados: 2, erros: 0 });
  assert.equal(files.length, 4);
  assert.match(app.vault.getAbstractFileByPath("Clippings/z-newest.md").body, /^---\n[\s\S]*?title: "z-newest"/);
  assert.equal(app.vault.getAbstractFileByPath("Clippings/a-duplicate-alias.md"), null);
  assert.deepEqual(
    ["a-oldest", "m-middle", "z-newest"].map((title) =>
      app.vault.getAbstractFileByPath(`Clippings/${title}.md`).frontmatter.corebrain_added_at),
    [
      "2026-09-26T12:00:00.000Z",
      "2026-09-26T12:00:00.001Z",
      "2026-09-26T12:00:00.002Z",
    ],
    "same-millisecond arrivals need distinct increasing values in oldest-to-newest write order",
  );
  assert.equal(existing.frontmatter.corebrain_added_at, originalArrival);
  assert.equal(existing.body, existingBody, "a pre-existing note must remain byte-for-byte unchanged");

  const view = new internals.GaleriaView({ app }, plugin);
  assert.deepEqual(view.notas().map(({ f }) => f.basename), [
    "z-newest", "m-middle", "a-oldest", "already-here",
  ]);

  const stampsBeforeRepeat = files.map((file) => [file.path, file.frontmatter.corebrain_added_at]);
  const second = await receptor.gravar(batch, "Clippings");
  assert.deepEqual({ ...second }, { criados: 0, pulados: 5, erros: 0 });
  assert.equal(files.length, 4, "repeated sync must not write the same X posts again");
  assert.deepEqual(files.map((file) => [file.path, file.frontmatter.corebrain_added_at]), stampsBeforeRepeat);
});

test("failed X bookmark writes report an error instead of a created note", async () => {
  const { internals } = loadMain({ DateImpl: FixedDate });
  const { app } = makeApp([]);
  const plugin = makePlugin(internals, app);
  const receptor = new internals.Receptor(plugin);
  const originalCreate = app.vault.create;
  app.vault.create = async (path, body) => {
    if (path === "Clippings/fails.md") throw new Error("simulated vault failure");
    return originalCreate(path, body);
  };

  const result = await receptor.gravar([
    bookmark("https://x.com/u/status/500", "fails"),
  ], "Clippings");

  assert.deepEqual({ ...result }, { criados: 0, pulados: 0, erros: 1 });
  assert.equal(app.vault.getAbstractFileByPath("Clippings/fails.md"), null);
});

test("failed arrival stamping is surfaced to the X sync as an error", async () => {
  const { internals } = loadMain({ DateImpl: FixedDate });
  const { app } = makeApp([]);
  const plugin = makePlugin(internals, app);
  const receptor = new internals.Receptor(plugin);
  app.fileManager.processFrontMatter = async () => {
    throw new Error("simulated frontmatter write failure");
  };

  const errorLog = console.error;
  console.error = () => {};
  let result;
  try {
    result = await receptor.gravar([
      bookmark("https://x.com/u/status/501", "stamp-fails"),
    ], "Clippings");
  } finally {
    console.error = errorLog;
  }

  assert.deepEqual({ ...result }, { criados: 0, pulados: 0, erros: 1 });
  const file = app.vault.getAbstractFileByPath("Clippings/stamp-fails.md");
  assert.ok(file, "a created note is preserved; the importer must not delete user data");
  assert.equal(file.frontmatter.corebrain_added_at, undefined);
});
