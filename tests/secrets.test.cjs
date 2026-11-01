const test = require('node:test');
const assert = require('node:assert/strict');
const { loadMain, makeApp, makePlugin } = require('./plugin-harness.cjs');

test('P9 migrates secrets outside plugin data and authenticates model calls', async () => {
  let authorization;
  const { internals } = loadMain({ requestUrl: async (req) => { authorization = req.headers.Authorization; return { json: { choices: [{ message: { content: '[]' } }] } }; } });
  const { app } = makeApp();
  const secrets = new Map();
  app.secretStorage = { getSecret: (id) => secrets.get(id) ?? null, setSecret: (id, value) => secrets.set(id, value) };
  const plugin = makePlugin(internals, app);
  const saved = [];
  plugin.loadData = async () => ({ ponteToken: 'a'.repeat(64), modeloChave: 'model-test-key', capaLocal: false });
  plugin.saveData = async (data) => saved.push({ ...data });
  await plugin.onload();
  assert.equal(plugin.ponteToken, 'a'.repeat(64));
  assert.equal(secrets.get('corebrain-ponte-token'), 'a'.repeat(64));
  assert.equal(secrets.get('corebrain-modelo-chave'), 'model-test-key');
  assert.ok(saved.length);
  assert.ok(saved.every((data) => !('ponteToken' in data) && !('modeloChave' in data)));
  await new internals.Classificador(plugin).chamar(['one']);
  assert.equal(authorization, 'Bearer model-test-key');
});

test('P9 keeps legacy data when SecretStorage cannot verify migration', async () => {
  const { internals } = loadMain();
  const { app } = makeApp();
  app.secretStorage = { getSecret: () => null, setSecret: () => {} };
  const plugin = makePlugin(internals, app);
  let writes = 0;
  plugin.loadData = async () => ({ ponteToken: 'b'.repeat(64) });
  plugin.saveData = async () => { writes++; };
  await assert.rejects(plugin.onload(), /Falha ao migrar segredo/);
  assert.equal(writes, 0);
});

test('P9 rotating token immediately invalidates old bearer', async () => {
  const { internals } = loadMain();
  const { app } = makeApp();
  const plugin = makePlugin(internals, app);
  plugin.definirTokenPonte('a'.repeat(64));
  const receptor = new internals.Receptor(plugin);
  const request = (token) => ({ headers: { authorization: `Bearer ${token}` } });
  assert.equal(receptor.autorizado(request('a'.repeat(64))), true);
  plugin.definirTokenPonte('b'.repeat(64));
  assert.equal(receptor.autorizado(request('a'.repeat(64))), false);
  assert.equal(receptor.autorizado(request('b'.repeat(64))), true);
});

test('P9 settings rotate the bridge token and use the configured model key', async () => {
  const fields = new Map();
  const buttons = new Map();
  class Setting {
    setName(name) { this.name = name; return this; }
    setDesc() { return this; }
    setHeading() { return this; }
    addText(callback) {
      const field = {
        inputEl: { setAttribute() {} },
        setPlaceholder() { return this; },
        setValue() { return this; },
        onChange(fn) { this.change = fn; return this; },
      };
      fields.set(this.name, field);
      callback(field);
      return this;
    }
    addTextArea(callback) { return this.addText(callback); }
    addDropdown(callback) {
      const field = { addOption() { return this; }, setValue() { return this; }, onChange() { return this; } };
      callback(field);
      return this;
    }
    addToggle(callback) { return this.addDropdown(callback); }
    addButton(callback) {
      const button = {
        setButtonText(text) { this.text = text; return this; },
        setCta() { return this; },
        setWarning() { return this; },
        onClick(fn) { buttons.set(this.text, fn); return this; },
      };
      callback(button);
      return this;
    }
  }
  let authorization;
  const { internals } = loadMain({
    SettingClass: Setting,
    requestUrl: async (req) => { authorization = req.headers.Authorization; return { json: { choices: [{ message: { content: '[]' } }] } }; },
  });
  const { app } = makeApp();
  const plugin = makePlugin(internals, app);
  plugin.definirTokenPonte('a'.repeat(64));
  const receptor = new internals.Receptor(plugin);
  const settings = new internals.AbaConfig(app, plugin);
  settings.display();
  await fields.get('Chave da API').change('model-test-key');
  await new internals.Classificador(plugin).chamar(['note']);
  assert.equal(authorization, 'Bearer model-test-key');
  await buttons.get('Gerar novo token')();
  assert.equal(receptor.autorizado({ headers: { authorization: `Bearer ${'a'.repeat(64)}` } }), false);
  assert.equal(receptor.autorizado({ headers: { authorization: `Bearer ${plugin.ponteToken}` } }), true);
  assert.equal(app.secretStorage.getSecret('corebrain-ponte-token'), plugin.ponteToken);
});
