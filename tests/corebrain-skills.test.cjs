const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const SKILL_NAMES = ['corebrain-search', 'corebrain-organize', 'corebrain-synthesize'];
const PRIVATE_PATHS = /(?:\/Users\/|\/home\/|LifeOS\s*-\s*Workspace|guilherme|data\.json|ponteToken|modeloChave)/i;

function readSkill(name) {
  const file = path.join(ROOT, 'skills', name, 'SKILL.md');
  assert.ok(fs.existsSync(file), `missing bundled skill: ${name}`);
  const text = fs.readFileSync(file, 'utf8');
  assert.equal(text.startsWith('---\n'), true, `${name} needs YAML frontmatter`);
  const end = text.indexOf('\n---\n', 4);
  assert.ok(end > 0, `${name} needs closed YAML frontmatter`);
  const frontmatter = Object.fromEntries(
    text.slice(4, end).split('\n').filter(Boolean).map((line) => {
      const colon = line.indexOf(':');
      assert.ok(colon > 0, `${name} frontmatter line is not key/value: ${line}`);
      return [line.slice(0, colon).trim(), line.slice(colon + 1).trim().replace(/^['"]|['"]$/g, '')];
    }),
  );
  return { name, file, frontmatter, body: text.slice(end + 5) };
}

function body(name) {
  return readSkill(name).body;
}

test('ships three portable Corebrain clipping skills with unique frontmatter names', () => {
  const skills = SKILL_NAMES.map(readSkill);
  assert.deepEqual(skills.map((skill) => skill.frontmatter.name), SKILL_NAMES);
  assert.equal(new Set(skills.map((skill) => skill.frontmatter.name)).size, SKILL_NAMES.length);
  for (const skill of skills) {
    assert.ok(skill.frontmatter.description, `${skill.name} needs a description`);
    assert.doesNotMatch(skill.frontmatter.name, /[A-Z\s_]/);
    assert.doesNotMatch(fs.readFileSync(skill.file, 'utf8'), PRIVATE_PATHS);
  }
});

test('search skill preserves Corebrain search and arrival invariants', () => {
  const text = body('corebrain-search');
  assert.match(text, /configured(?: Corebrain)? gallery folders/i);
  assert.match(text, /all terms|every(?:\W+distinct)?\W+term/i);
  assert.match(text, /accent|diacritic/i);
  assert.match(text, /case-insensitive|case insensitive/i);
  assert.match(text, /corebrain_added_at/);
  assert.match(text, /immutable|do not change/i);
  assert.match(text, /created|published|source date/i);
  assert.match(text, /body/i);
});

test('organize skill is proposal-first and protects clipping metadata', () => {
  const text = body('corebrain-organize');
  assert.match(text, /configured(?: Corebrain)? gallery folders/i);
  assert.match(text, /preview|propose|dry-run/i);
  assert.match(text, /confirm|confirmation|explicit request/i);
  assert.match(text, /tags?/i);
  assert.match(text, /collection/i);
  assert.match(text, /corebrain_added_at/);
  assert.match(text, /source/);
  assert.match(text, /created|published/);
  assert.match(text, /body/i);
  assert.match(text, /bulk.*(edit|delete)|bulk edits|bulk changes/i);
});

test('synthesize skill requires citations and separates evidence from inference', () => {
  const text = body('corebrain-synthesize');
  assert.match(text, /configured(?: Corebrain)? gallery folders/i);
  assert.match(text, /citation|cite|source link/i);
  assert.match(text, /note link|wikilink|note path/i);
  assert.match(text, /direct claims|supported claims|evidence/i);
  assert.match(text, /inference|interpretation/i);
  assert.match(text, /uncertain|unknown|not found/i);
  assert.match(text, /do not edit|without.*write|read-only/i);
});

test('every bundled skill rejects ambient tools, secrets, and untrusted clipped instructions', () => {
  for (const name of SKILL_NAMES) {
    const text = body(name);
    assert.match(text, /no shell|do not[\s\S]{0,40}shell|without[\s\S]{0,40}shell/i, `${name} must not default to shell`);
    assert.match(text, /no network|do not[\s\S]{0,40}network|without[\s\S]{0,40}network/i, `${name} must not default to network`);
    assert.match(text, /credential|secret|api key/i, `${name} must define credential boundary`);
    assert.match(text, /untrusted|not instructions|do not follow/i, `${name} must treat clipped text as data`);
    assert.match(text, /global|project|external.*skill|extension/i, `${name} must not inherit ambient extensions/skills`);
    assert.match(text, /available|granted|provided.*tools/i, `${name} must respect host-granted tools`);
  }
});
