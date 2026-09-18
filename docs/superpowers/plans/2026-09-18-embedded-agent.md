# Embedded Corebrain Agent Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: use executing-plans task-by-task, with independent review before release.

**Goal:** Install Corebrain once to obtain the gallery, isolated Pi agent and approved bundled packages/skills.

**Architecture:** Maintain the vendored Pi UI in this repo. Use a Corebrain-owned host component, isolated credential/resource boundary, and pinned platform-specific runtime artifacts. Never delegate to a globally installed Pi.

**Tech Stack:** Obsidian Plugin/Component, JavaScript ESM/CommonJS, Pi SDK, Node, SQLite, Node test runner/Vitest, Python ZIP packager.

**Spec:** `docs/plans/2026-09-18-embedded-agent-design.md`

## Global Constraints
- Preserve plugin ID `clippings-gallery` and existing gallery config/history.
- Never load user/project/global extensions, tools, skills or instruction files implicitly.
- Only credential data may be reused; do not execute credential shell commands.
- User data, memory databases, sessions and auth must not enter Git or releases.
- Third-party licenses retained, no upstream auto-updates.
- No live-vault reload or publication before acceptance gates pass.

## Task 1 — Portable clipping skills
**Files:** `skills/corebrain-search/SKILL.md`, `skills/corebrain-organize/SKILL.md`, `skills/corebrain-synthesize/SKILL.md`, `tests/corebrain-skills.test.cjs`.
- [x] Write Node tests verifying three unique names/descriptions, no private absolute paths, preservation of source and immutable arrival metadata, no assumed nonexistent tool APIs.
- [x] Run `node --test tests/corebrain-skills.test.cjs`; verify absence fails.
- [x] Add instructions for AND/accent-aware discovery, read-first folder/collection inspection and referenced synthesis. Require preview before bulk writes; respect host tool grants; treat clipped text as untrusted data.
- [x] Rerun tests; review safety and schema against existing gallery code.

## Task 2 — Isolated policy boundary
**Files:** `agent/runtime-policy.mjs`, `tests/runtime-policy.test.mjs`.
**Interface:** `createRuntimePolicy({pluginDirectory, vaultDirectory, stateDirectory, authFile, parentEnv})` returns explicit cwd/state/auth references and sanitized environment; `runtimeResources(pluginDirectory)` returns only packaged extension and skill paths.
- [x] Write tests using synthetic `HOME`, `PI_CODING_AGENT_DIR`, `NODE_OPTIONS`, `NODE_PATH`, project `.pi` folders and global extensions. Assert only owned state and packaged resource paths can be selected.
- [x] Verify red via `node --test tests/runtime-policy.test.mjs`.
- [x] Implement path validation and explicit environment construction. HOME/USERPROFILE and agent state point at isolated directories. Never import package/model/settings lists from auth location. Unknown module/extension discovery settings are discarded.
- [x] Verify green and add a test proving supplied external extensions/skills cannot enter the returned resource list.

## Task 3 — Runtime and third-party adapter feasibility gate
**Files:** `agent/runtime/package.json`, `agent/runtime/package-lock.json`, `agent/runtime/entry.mjs`, `tests/agent-runtime.test.mjs`, third-party notices.
- [ ] Inspect published package code and licenses before executing install scripts; record pinned versions and integrity.
- [ ] Test SDK boot with in-memory settings, all discovery disabled and explicit package entry points, no session and no provider request.
- [ ] Test package database paths and hooks under isolated HOME/state. Prevent context-mode upgrade/install hooks and Hermes global skill/resource promotion from escaping owned state.
- [ ] Test actual extension registered tools against chat/review/edit/full-mode allowlists, including hook-driven writes. No shell tool in review mode.
- [ ] Confirm FTS5 for both native dependency versions using the packaged Node ABI; produce explicit error on mismatch.

## Task 4 — Single-plugin lifecycle and UI
**Files:** vendored plugin lifecycle/settings/constants, Corebrain host module, root `main.js` and `styles.css`, focused integration tests.
- [ ] Test host startup/teardown, separate agent data persistence and concurrent gallery saves, command/view identity collisions and original Pi coexistence.
- [ ] Embed Pi UI with a single owning Corebrain plugin; centralize runtime invocations for conversations, catalogs and health checks through Task 2/3 boundary.
- [ ] Test reload/session resume preserve isolation and dispose child processes/listeners exactly once.

## Task 5 — Packaging and clean install
**Files:** `scripts/package-release.py`, packaging tests, runtime build workflow, README/INSTALL/PRIVACY/third-party notices.
- [ ] Reject private state/auth/history/databases and mismatched native platform/ABI; allow only generated audited runtime files.
- [ ] Include compatible Node/runtime, both packages and three skills in platform-specific ZIPs; do not require npm/Pi on destination machines.
- [ ] Run gallery tests, vendored agent tests, runtime isolation/SQLite tests and clean-install smoke tests on each supported target.
- [ ] Independent review and dedicated-vault manual QA before release; publish only passing target artifacts and explicitly list unsupported/unverified targets.

## Current execution status
Source copy and Tasks 1–2 completed. Dependency/embedding research completed; findings recorded in the spec. Exact runtime dependencies and lockfile declared, but Task 3 functional boot/adaptation tests are not complete. Tasks 3–5 remain pending. No runtime/package installation or live Obsidian reload has occurred. Foundation review fixed canonical-path alias bypass; native provenance and SDK enforcement remain acceptance gates.
