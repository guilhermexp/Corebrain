const test = require("node:test");
const assert = require("node:assert/strict");

const {
  FakeClock,
  FakeElement,
  FakeImage,
  loadMain,
  makeApp,
  makeFile,
  makePlugin,
} = require("./plugin-harness.cjs");

function modelResponse(content) {
  return { json: { choices: [{ message: { content } }] } };
}

test("baixarCapasLocais does not count a blocked cover as downloaded", async () => {
  const { internals } = loadMain();
  const file = makeFile("Clippings/blocked.md", { source: "https://example.test/blocked", image: "https://img.test/blocked.jpg" });
  const { app } = makeApp([file]);
  const plugin = makePlugin(internals, app);
  plugin.semCopiaLocal = () => [file];
  plugin.baixarCapa = async () => "bloqueado";

  const result = await plugin.baixarCapasLocais();

  assert.equal(result.ok, 0);
});

test("baixarCapasLocais does not count a cover already being downloaded as downloaded", async () => {
  const { internals } = loadMain();
  const file = makeFile("Clippings/racing.md", { source: "https://example.test/racing", image: "https://img.test/racing.jpg" });
  const { app } = makeApp([file]);
  const plugin = makePlugin(internals, app);
  plugin.semCopiaLocal = () => [file];
  plugin.baixarCapa = async () => "em andamento";

  const result = await plugin.baixarCapasLocais();

  assert.equal(result.ok, 0);
});

test("cover retry follows the image selected in the carousel and ignores stale timers", () => {
  const clock = new FakeClock();
  const { internals } = loadMain({ clock });
  const img = new FakeImage({ src: "https://img.test/first.jpg" });
  const moldura = new FakeElement();
  internals.capaComRetentativa(img, moldura, "https://img.test/first.jpg", 2);

  img.dispatchEvent({ type: "error" });
  img.src = "https://img.test/second.jpg";
  clock.runNext();
  assert.equal(img.src, "https://img.test/second.jpg", "a tentativa agendada para a primeira imagem ficou obsoleta");

  img.dispatchEvent({ type: "error" });
  clock.runNext();
  assert.match(img.src, /^https:\/\/img\.test\/second\.jpg\?cgr=1$/);
});

test("partial translation stays pending and never retranslates a completed field", async () => {
  let calls = 0;
  const responses = [
    modelResponse('[{"n":1,"t":"Titulo traduzido","d":""}]'),
    modelResponse('[{"n":1,"t":"Titulo traduzido de novo","d":"Descricao traduzida"}]'),
  ];
  const { internals } = loadMain({ requestUrl: async () => { calls++; return responses.shift(); } });
  const file = makeFile("Clippings/translate.md", {
    title: "Original title",
    description: "Original description",
    source: "https://example.test/translate",
  });
  const { app } = makeApp([file]);
  const plugin = makePlugin(internals, app);

  await plugin.traduzir();
  assert.equal(new internals.Tradutor(plugin).pendentes().length, 1, "a nota ainda tem um campo sem traducao");
  assert.equal(file.frontmatter.title, "Titulo traduzido");
  assert.equal(file.frontmatter.title_original, "Original title");
  assert.equal(file.frontmatter.description, "Original description");

  await plugin.traduzir();
  assert.equal(calls, 2);
  assert.equal(file.frontmatter.title, "Titulo traduzido", "o titulo pronto nao foi traduzido novamente");
  assert.equal(file.frontmatter.title_original, "Original title", "o original foi preservado");
  assert.equal(file.frontmatter.description, "Descricao traduzida");
  assert.equal(file.frontmatter.description_original, "Original description");
});

test("manual scroll cancels delayed scroll restoration", () => {
  const clock = new FakeClock();
  const { internals } = loadMain({ clock });
  const app = makeApp([]).app;
  const view = new internals.GaleriaView({ app }, {});
  const painel = new FakeElement();

  view.programarRestauracaoScroll(painel, 320);
  painel.scrollTop = 40;
  painel.dispatchEvent({ type: "scroll" });
  clock.runAll();

  assert.equal(painel.scrollTop, 40);
});

test("clamped programmatic scroll keeps delayed restoration alive", async () => {
  const clock = new FakeClock();
  const { internals } = loadMain({ clock });
  const app = makeApp([]).app;
  const view = new internals.GaleriaView({ app }, {});
  const painel = new FakeElement();
  let actual = 0;
  let maxScroll = 100;
  Object.defineProperty(painel, "scrollTop", {
    configurable: true,
    get: () => actual,
    set: (value) => {
      actual = Math.min(Number(value), maxScroll);
      queueMicrotask(() => painel.dispatchEvent({ type: "scroll" }));
    },
  });

  view.programarRestauracaoScroll(painel, 320);
  await Promise.resolve();
  assert.equal(actual, 100);
  assert.equal(clock.jobs.size, 4, "the clamp event must not cancel the remaining timers");

  maxScroll = 500;
  clock.runAll();
  assert.equal(actual, 320);
});

test("view cleanup disconnects observers and cancels scroll timers", async () => {
  const clock = new FakeClock();
  const { internals } = loadMain({ clock });
  const app = makeApp([]).app;
  const view = new internals.GaleriaView({ app }, {});
  const cleanups = [];
  view.register = (fn) => cleanups.push(fn);
  view.render = () => {};
  await view.onOpen();
  let observedDisconnected = 0;
  let measuredDisconnected = 0;
  view.observador = { disconnect: () => observedDisconnected++ };
  view.medidor = { disconnect: () => measuredDisconnected++ };
  view.programarRestauracaoScroll(new FakeElement(), 100);
  assert.equal(clock.jobs.size, 4);

  cleanups[0]();

  assert.equal(observedDisconnected, 1);
  assert.equal(measuredDisconnected, 1);
  assert.equal(clock.jobs.size, 0);
});

test("renaming a clipping updates every saved-search path", async () => {
  const { internals } = loadMain();
  const oldFile = makeFile("Clippings/old-name.md", { title: "Old" });
  const { app } = makeApp([oldFile]);
  const plugin = makePlugin(internals, app);
  plugin.cfg.buscas = {
    leitura: { pedido: "leitura", criada: "2026-09-18", caminhos: ["Clippings/old-name.md"] },
    outra: { pedido: "outra", criada: "2026-09-18", caminhos: ["Clippings/other.md"] },
  };
  oldFile.path = "Clippings/new-name.md";

  await plugin.atualizarBuscasRenomeada(oldFile, "Clippings/old-name.md");

  assert.deepEqual(Array.from(plugin.cfg.buscas.leitura.caminhos), ["Clippings/new-name.md"]);
  assert.deepEqual(Array.from(plugin.cfg.buscas.outra.caminhos), ["Clippings/other.md"]);
});

test("renaming a folder updates saved-search descendants", async () => {
  const { internals } = loadMain();
  const oldFile = makeFile("Clippings/old-folder/note.md", { title: "Old" });
  const { app } = makeApp([oldFile]);
  const plugin = makePlugin(internals, app);
  plugin.cfg.buscas = {
    leitura: {
      pedido: "leitura",
      criada: "2026-09-18",
      caminhos: ["Clippings/old-folder/note.md", "Clippings/old-folder/other.md"],
    },
  };
  const renamedFolder = { path: "Clippings/new-folder" };

  await plugin.atualizarBuscasRenomeada(renamedFolder, "Clippings/old-folder");

  assert.deepEqual(Array.from(plugin.cfg.buscas.leitura.caminhos), [
    "Clippings/new-folder/note.md",
    "Clippings/new-folder/other.md",
  ]);
});

test("irrelevant metadata does not schedule a gallery redraw", () => {
  const { internals } = loadMain();
  const file = makeFile("Clippings/meta.md", { title: "Title", tags: ["videos"] });
  const { app } = makeApp([file]);
  const plugin = makePlugin(internals, app);
  const view = new internals.GaleriaView({ app }, plugin);
  let renders = 0;
  view.agendarRender = () => { renders++; };
  view.lembrarMetadata(file, { frontmatter: file.frontmatter });

  if (view.metadataMudou(file, { frontmatter: { ...file.frontmatter, author: "ignored" } })) view.agendarRender();
  assert.equal(renders, 0);

  if (view.metadataMudou(file, { frontmatter: { ...file.frontmatter, title: "Changed" } })) view.agendarRender();
  assert.equal(renders, 1);
});

test("body image changes schedule a gallery redraw without redrawing for prose edits", () => {
  const { internals } = loadMain();
  const file = makeFile("Clippings/body.md", { title: "Title", tags: ["videos"] });
  const { app } = makeApp([file]);
  const plugin = makePlugin(internals, app);
  const view = new internals.GaleriaView({ app }, plugin);
  let renders = 0;
  view.agendarRender = () => { renders++; };
  // The initial render learns body images asynchronously through imagensDe;
  // seed that cache to model the steady state before a later metadata event.
  plugin.imgs.set(file.path, ["https://img.test/one.jpg"]);
  view.sincronizarMetadata();

  if (view.metadataMudou(file, "Intro edited\n![](https://img.test/one.jpg)\n", { frontmatter: file.frontmatter })) view.agendarRender();
  assert.equal(renders, 0);
  if (view.metadataMudou(file, "Intro\n![](https://img.test/two.jpg)\n", { frontmatter: file.frontmatter })) view.agendarRender();
  assert.equal(renders, 1);
});

test("rename out of the gallery still schedules a redraw", async () => {
  const { internals } = loadMain();
  const file = makeFile("Clippings/moving.md", { title: "Moving" });
  const { app } = makeApp([file]);
  const plugin = makePlugin(internals, app);
  const view = new internals.GaleriaView({ app }, plugin);
  view.render = () => {};
  let renders = 0;
  view.agendarRender = () => { renders++; };
  await view.onOpen();

  file.path = "Archive/moving.md";
  app.vault.emit("rename", file, "Clippings/moving.md");

  assert.equal(renders, 1);
});

test("overlapping classification starts share one bulk job", async () => {
  let resolveRequest;
  let calls = 0;
  const pending = new Promise((resolve) => { resolveRequest = resolve; });
  const { internals } = loadMain({ requestUrl: async () => { calls++; return pending; } });
  const file = makeFile("Clippings/classify.md", { title: "Video project", description: "A video", tags: [] });
  const { app } = makeApp([file]);
  const plugin = makePlugin(internals, app);
  const first = plugin.classificar();
  const second = plugin.classificar();
  assert.strictEqual(first, second);

  resolveRequest(modelResponse('[{"n":1,"cols":["videos"]}]'));
  await first;
  assert.equal(calls, 1);
  assert.deepEqual(Array.from(file.frontmatter.tags), ["videos"]);
});

test("overlapping translation starts share one bulk job", async () => {
  let resolveRequest;
  let calls = 0;
  const pending = new Promise((resolve) => { resolveRequest = resolve; });
  const { internals } = loadMain({ requestUrl: async () => { calls++; return pending; } });
  const file = makeFile("Clippings/translate-overlap.md", { title: "Original", description: "Description" });
  const { app } = makeApp([file]);
  const plugin = makePlugin(internals, app);
  const first = plugin.traduzir();
  const second = plugin.traduzir();
  assert.strictEqual(first, second);

  resolveRequest(modelResponse('[{"n":1,"t":"Original traduzido","d":"Description traduzida"}]'));
  await first;
  assert.equal(calls, 1);
});

test("identical model output marks a field complete for future translation runs", async () => {
  let calls = 0;
  const { internals } = loadMain({
    requestUrl: async () => {
      calls++;
      return modelResponse('[{"n":1,"t":"Proper noun","d":"Descricao traduzida"}]');
    },
  });
  const file = makeFile("Clippings/legacy-identical.md", {
    title: "Proper noun",
    description: "Original description",
  });
  const { app } = makeApp([file]);
  const plugin = makePlugin(internals, app);

  await plugin.traduzir();
  assert.equal(file.frontmatter.title_original, "Proper noun");
  assert.equal(file.frontmatter.description_original, "Original description");
  assert.equal(new internals.Tradutor(plugin).pendentes().length, 0);

  await plugin.traduzir();
  assert.equal(calls, 1);
});

test("legacy notes without a title can finish a pending description", async () => {
  const { internals } = loadMain({
    requestUrl: async () => modelResponse('[{"n":1,"t":"","d":"Descricao traduzida"}]'),
  });
  const file = makeFile("Clippings/no-title.md", { description: "Original description" });
  const { app } = makeApp([file]);
  const plugin = makePlugin(internals, app);

  await plugin.traduzir();

  assert.equal(file.frontmatter.title, undefined);
  assert.equal(file.frontmatter.description, "Descricao traduzida");
  assert.equal(file.frontmatter.description_original, "Original description");
  assert.equal(new internals.Tradutor(plugin).pendentes().length, 0);
});

test("overlapping cover starts share one bulk job", async () => {
  let resolveCover;
  let calls = 0;
  const pending = new Promise((resolve) => { resolveCover = resolve; });
  const { internals } = loadMain();
  const file = makeFile("Clippings/covers-overlap.md", { source: "https://example.test/cover", image: "https://img.test/cover.jpg" });
  const { app } = makeApp([file]);
  const plugin = makePlugin(internals, app);
  plugin.semCopiaLocal = () => [file];
  plugin.baixarCapa = async () => { calls++; await pending; return "ok"; };
  const first = plugin.baixarCapasLocais();
  const second = plugin.baixarCapasLocais();
  assert.strictEqual(first, second);

  resolveCover();
  await first;
  assert.equal(calls, 1);
});

test("emAndamento cover calls do not duplicate the underlying download", async () => {
  let resolveDownload;
  let calls = 0;
  const pending = new Promise((resolve) => { resolveDownload = resolve; });
  const { internals } = loadMain();
  const file = makeFile("Clippings/locked.md", { source: "https://example.test/locked", image: "https://img.test/locked.jpg" });
  const { app } = makeApp([file]);
  const plugin = makePlugin(internals, app);
  plugin.baixarCapaAgora = async () => { calls++; await pending; return "ok"; };

  const first = plugin.baixarCapa(file);
  const second = plugin.baixarCapa(file);
  assert.equal(await second, "em andamento");
  resolveDownload();
  assert.equal(await first, "ok");
  assert.equal(calls, 1);
});
