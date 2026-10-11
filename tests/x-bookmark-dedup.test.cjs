const test = require("node:test");
const assert = require("node:assert/strict");

const { loadMain, makeApp, makeFile, makePlugin } = require("./plugin-harness.cjs");

function bookmark(source, nome = "Bookmark") {
  return {
    nome,
    source,
    conteudo: [
      "---",
      `title: ${JSON.stringify(nome)}`,
      `source: ${JSON.stringify(source)}`,
      "---",
      "original bookmark body",
      "",
    ].join("\n"),
  };
}

test("X bookmark batch deduplicates by post ID across hosts, handles and URL variants", async () => {
  const { internals } = loadMain();
  const oldSource = "https://x.com/old_handle/status/1999999999999999999?ref_src=twsrc%5Etfw";
  const existing = makeFile("Clippings/old.md", { source: oldSource }, bookmark(oldSource).conteudo);
  const { app, files } = makeApp([existing]);
  const plugin = makePlugin(internals, app);
  const receptor = new internals.Receptor(plugin);
  const incoming = [
    bookmark("https://twitter.com/new_handle/status/1999999999999999999?lang=en", "Renamed handle"),
    bookmark("https://mobile.twitter.com/i/web/status/1999999999999999999?ref=bookmark", "Web status alias"),
    bookmark("https://www.x.com/a/status/2000000000000000000?s=20", "Different ID"),
    bookmark("https://x.com.evil.example/a/status/1999999999999999999", "Lookalike host"),
  ];

  const first = await receptor._gravar(incoming, "Clippings");

  assert.equal(first.criados, 2);
  assert.equal(first.pulados, 2);
  assert.equal(first.erros, 0);
  assert.equal(files.length, 3);
  assert.match(files.find((file) => file.basename === "Different ID").body, /https:\/\/www\.x\.com\/a\/status\/2000000000000000000\?s=20/);
  assert.match(files.find((file) => file.basename === "Lookalike host").body, /https:\/\/x\.com\.evil\.example\/a\/status\/1999999999999999999/);

  const second = await receptor._gravar(incoming, "Clippings");
  assert.equal(second.criados, 0);
  assert.equal(second.pulados, 4);
  assert.equal(second.erros, 0);
  assert.equal(files.length, 3, "a repeated sync must not create new notes");
});

test("all source duplicate paths recognize X aliases without changing the saved source", async () => {
  const { internals, notices } = loadMain();
  const oldSource = "https://www.twitter.com/original/status/42?utm_source=old";
  const newSource = "https://x.com/renamed/status/42?utm_source=new";
  const original = makeFile("Clippings/original.md", { source: oldSource }, bookmark(oldSource, "Original").conteudo);
  const duplicate = makeFile("Clippings/duplicate.md", { source: newSource }, bookmark(newSource, "Duplicate").conteudo);
  const { app } = makeApp([original, duplicate]);
  const plugin = makePlugin(internals, app);
  const receptor = new internals.Receptor(plugin);

  assert.equal(plugin.notaComSource("https://mobile.x.com/i/web/status/42?from=sync"), original);
  const clip = await receptor._gravarClip({ nome: "Clip alias", conteudo: bookmark("https://twitter.com/another/status/42", "Clip alias").conteudo });
  assert.equal(clip.duplicata, true);
  const duplicates = plugin.duplicatas();
  assert.equal(duplicates.length, 1);
  assert.equal(duplicates[0], duplicate);

  await plugin.avisarDuplicata(duplicate);
  assert.equal(notices.length, 1, "duplicate warning should detect username changes");
  assert.equal(original.frontmatter.source, oldSource);
  assert.equal(duplicate.frontmatter.source, newSource);
});

test("a bookmark with missing cached source metadata is still deduplicated from its YAML", async () => {
  const { internals } = loadMain();
  const oldSource = "https://x.com/former/status/777";
  const existing = makeFile("Clippings/cached.md", {}, bookmark(oldSource, "Cached").conteudo);
  const { app, files } = makeApp([existing]);
  const plugin = makePlugin(internals, app);
  const receptor = new internals.Receptor(plugin);

  const result = await receptor._gravar([
    bookmark("https://twitter.com/current/status/777?utm_source=extension", "Cached duplicate"),
  ], "Clippings");

  assert.equal(result.criados, 0);
  assert.equal(result.pulados, 1);
  assert.equal(result.erros, 0);
  assert.equal(files.length, 1);
});

test("partial source overlap never offers a note for destructive duplicate cleanup", async () => {
  for (const shared of ["https://example.com/a", "https://x.com/old/status/123"]) {
    const { internals, notices } = loadMain();
    const alias = shared.includes("x.com") ? "https://twitter.com/new/status/123" : shared;
    const original = makeFile("Clippings/one.md", { source: [shared] });
    const multiple = makeFile("Clippings/multiple.md", { source: [alias, "https://example.com/unique"] });
    original.stat.ctime -= 1000;
    const plugin = makePlugin(internals, makeApp([original, multiple]).app);
    assert.equal(plugin.duplicatas().length, 0);
    await plugin.avisarDuplicata(multiple);
    assert.equal(notices.length, 0);
  }
});

test("identical canonical source sets remain duplicates regardless of order or alias", async () => {
  const { internals, notices } = loadMain();
  const original = makeFile("Clippings/one.md", { source: ["https://x.com/old/status/123", "https://example.com/b"] });
  const copy = makeFile("Clippings/copy.md", { source: ["https://example.com/b", "https://twitter.com/new/status/123?s=20"] });
  original.stat.ctime -= 1000;
  const plugin = makePlugin(internals, makeApp([original, copy]).app);
  assert.equal(plugin.duplicatas().length, 1);
  assert.equal(plugin.duplicatas()[0], copy);
  await plugin.avisarDuplicata(copy);
  assert.equal(notices.length, 1);
});

test("adjacent snowflake IDs remain distinct even when Number rounds them together", async () => {
  const first = "1958065967667507690", second = "1958065967667507691";
  assert.equal(Number(first), Number(second));
  const { internals } = loadMain();
  const original = makeFile("Clippings/one.md", { source: `https://x.com/user/status/${first}` });
  const { app, files } = makeApp([original]);
  const plugin = makePlugin(internals, app);
  const result = await new internals.Receptor(plugin).gravar([bookmark(`https://x.com/user/status/${second}`)], "Clippings");
  assert.equal(result.criados, 1);
  assert.equal(result.pulados, 0);
  assert.equal(files.length, 2);
});
