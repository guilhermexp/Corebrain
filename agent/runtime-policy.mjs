import path from 'node:path';
import fs from 'node:fs';

// Resource discovery boundary only, NOT an operating-system sandbox. The SDK
// launcher must apply this policy to every process/session/catalog it creates.
function absolute(value, label) {
  if (typeof value !== 'string' || !path.isAbsolute(value)) {
    throw new TypeError(`${label} must be an explicit absolute path`);
  }
  return canonicalPath(path.resolve(value));
}

// Resolve existing ancestors as well as complete paths: private state may not
// exist on first run, while its parent may already be a symlink. The launcher
// must still revalidate after mkdir and before opening files (TOCTOU boundary).
function canonicalPath(value) {
  try { return fs.realpathSync.native(value); }
  catch (error) {
    if (error.code !== 'ENOENT') throw error;
    const parent = path.dirname(value);
    if (parent === value) throw error;
    return path.join(canonicalPath(parent), path.basename(value));
  }
}

export function runtimeResources(pluginDirectory) {
  const root = absolute(pluginDirectory, 'pluginDirectory');
  const packages = path.join(root, 'agent', 'runtime', 'node_modules');
  return {
    extensionPaths: [
      path.join(packages, 'pi-hermes-memory', 'src', 'index.ts'),
      path.join(packages, 'context-mode', 'build', 'adapters', 'pi', 'extension.js'),
    ],
    skillPaths: ['corebrain-search', 'corebrain-organize', 'corebrain-synthesize']
      .map(name => path.join(root, 'skills', name)),
  };
}

export function createRuntimePolicy({
  pluginDirectory, vaultDirectory, stateDirectory, authFile, parentEnv = {},
}) {
  const root = absolute(pluginDirectory, 'pluginDirectory');
  const cwd = absolute(vaultDirectory, 'vaultDirectory');
  const state = absolute(stateDirectory, 'stateDirectory');
  if (state === root || state === cwd) {
    throw new TypeError('Private state must have its own dedicated directory');
  }
  const agentDir = path.join(state, 'pi');
  const home = path.join(state, 'home');
  // Start empty: never spread process.env. In particular NODE_OPTIONS/NODE_PATH,
  // shell startup files and arbitrary Pi configuration variables are untrusted.
  const env = {};
  for (const name of ['PATH', 'SystemRoot', 'WINDIR', 'ComSpec', 'PATHEXT', 'LANG', 'LC_ALL', 'TZ']) {
    if (typeof parentEnv[name] === 'string') env[name] = parentEnv[name];
  }
  Object.assign(env, {
    HOME: home,
    USERPROFILE: home,
    PI_CODING_AGENT_DIR: agentDir,
    XDG_CONFIG_HOME: path.join(state, 'config'),
    XDG_CACHE_HOME: path.join(state, 'cache'),
    XDG_DATA_HOME: path.join(state, 'data'),
    APPDATA: path.join(state, 'config'),
    LOCALAPPDATA: path.join(state, 'cache'),
    TMPDIR: path.join(state, 'tmp'),
    TEMP: path.join(state, 'tmp'),
    TMP: path.join(state, 'tmp'),
  });
  return {
    cwd,
    stateDirectory: state,
    agentDir,
    authFile: authFile === undefined ? path.join(agentDir, 'auth.json') : absolute(authFile, 'authFile'),
    env,
    settings: {},
    loader: {
      noExtensions: true,
      noSkills: true,
      noPromptTemplates: true,
      noThemes: true,
      noContextFiles: true,
    },
    resources: runtimeResources(root),
  };
}
