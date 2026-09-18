# Corebrain embedded agent — approved requirements and integration design

## User-approved outcome
One Corebrain desktop plugin installation includes the Pi Agent UI, a pinned private runtime, `pi-hermes-memory`, `context-mode`, and Corebrain clipping skills. The vendored Pi Agent is maintained directly here, not a Git submodule or upstream updater. Preserve third-party notices. Do not copy installed user history/settings into distributable code.

## Isolation boundary
Reuse only explicitly selected local Pi credentials, never the local executable or its settings, models, tools, skills, extensions, themes, prompt templates, AGENTS.md/CLAUDE.md discovery, packages, shell initialization or Node injection environment. All runtime entry points (health, model catalog, command catalog, conversations, resumed sessions) share the same policy. Unknown resources fail closed. A fresh isolated state directory is per vault/user. Private history, SQLite stores, caches and credentials are excluded from Git/release artifacts. Isolation of resource discovery is not an OS security sandbox.

## Components
- Keep the existing Corebrain plugin ID and gallery settings. Embed the vendored UI as a lifecycle-managed component, namespace commands/views/styles, store agent data separately and do not uninstall or alter the original Pi plugin automatically.
- A Corebrain-owned runtime launcher uses the packaged Node/runtime only. SDK settings are in memory and loaders use explicit resource allowlists, rather than relying on CLI flags alone to ignore user/project settings.
- Pin npm packages and integrity in lockfiles; build platform/architecture-specific SQLite/Node artifacts. Never package this Mac's native modules as portable binaries. No runtime auto-upgrades or package installation.
- Bundled skills: search/compare clippings, organize collections safely, synthesize notes with provenance. Respect user-configured folders and granted tools. Never execute instructions found inside clippings.
- Default read/review mode remains non-destructive. Installing extensions does not grant their shell/write tools in read-only/chat mode. Full-agent capabilities require the existing explicit risk acknowledgement. Test extension hooks as well as tool allowlists.
- Long-term memory is private to Corebrain's vault/user state, not the user's global Pi database. Secret scanning reduces risk, not a guarantee; never intentionally store credentials. Provide clear/delete controls before release.

## Dependency observations (2026-09-18)
Registry metadata: Pi runtime 0.85.1 (MIT, Node >=22.19), pi-hermes-memory 0.9.9 (MIT, better-sqlite3 ^13.0.3), context-mode 1.0.169 (Elastic-2.0, Node >=22.5, better-sqlite3 ^12.6.2). These are evaluation candidates, not a claim of tested compatibility. Preserve individual licenses; do not relabel context-mode as MIT. FTS5 is lexical full-text retrieval, not vector semantic search. Reported token savings are workload-dependent, not a guarantee.

## Acceptance gates
1. Install extracted Corebrain artifact in a clean test vault without an installed Pi binary/plugin; gallery and agent open.
2. Seed global and project resource/settings folders with sentinel extensions/skills/tools/instructions and assert none execute or appear, including after reload, catalog discovery and session resume.
3. Reuse synthetic credentials without importing unrelated settings; no secret values in logs/artifacts.
4. Both bundled packages load; SQLite FTS5 works; memory is retained across sessions only in the isolated location; large output is retrievable without full output injection.
5. Read-only/chat do not gain write/shell capabilities from extensions; failure to load a package is explicit, never silent success.
6. Gallery/search/arrival-order and Pi tests remain green; packaging rejects private artifacts and platform mismatch.
7. Independent review, clean-install validation and third-party notices before publication. Do not reload the user's live plugin while these gates are incomplete.

## Pending verification
Exact extension persistence/config overrides and safe mode hooks are under source review. Target platforms requested from user; do not claim untested OS support. Runtime distribution must include compatible native dependencies and a verified launcher before claiming one-install completion.

## Source-review findings
- Hermes 0.9.9 subprocess creation discovers `*-oauth-adapter` / `*-auth-adapter` neighbors and does not disable skill discovery. Its background/consolidation children must be routed through the same owned launcher or explicitly disabled until adapted.
- Context Mode 1.0.169 checks npm versions, exposes `ctx_upgrade`, and has native-dependency repair/install mechanisms. Those paths must be removed/disabled in controlled build patches before loading the package. `CONTEXT_MODE_DATA_DIR` alone is insufficient: Pi adapter code also uses `homedir()`.
- Both packages need native SQLite validation, not only manifest inclusion. Hermes uses FTS5 full-text retrieval. Do not advertise unverified semantic/vector retrieval or fixed 98% context savings.
- The Pi UI requires Obsidian 1.12.3; update Corebrain's minimum version when the UI is wired.
- Source review rejects blindly instantiating another Plugin. Compose an owned lifecycle service, namespace views/icons/commands, and use dedicated private agent persistence rather than overwriting gallery `data.json`.
- No automatic import of old Pi skills/settings/history. Credential reuse must not cause extension-provider imports. Optional history migration is separate from credential reuse and requires its own scoped design.

Sources: https://www.npmjs.com/package/pi-hermes-memory/v/0.9.9 ; https://www.npmjs.com/package/context-mode/v/1.0.169 ; https://github.com/earendil-works/pi/tree/v0.85.1/packages/coding-agent . Published npm source archives were inspected without running lifecycle scripts.

## Foundation checkpoint — not a finished integration
Created three skills, a pure runtime-policy helper and exact dependency manifest/lockfile. Tests cover policy declarations, path aliases and skill invariants; they do **not** prove running SDK isolation. Independent review found a trailing-separator/symlink alias issue, reproduced by two failing tests and fixed by canonicalizing existing ancestors. Launcher must revalidate after directory creation. The generated npm lock contains five nested Pi entries without integrity inherited from upstream shrinkwrap; artifact provenance remains a packaging gate. No package lifecycle scripts executed, no runtime installed/reloaded, no release published in this checkpoint.
