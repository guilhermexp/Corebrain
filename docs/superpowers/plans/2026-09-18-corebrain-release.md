# Corebrain Release Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use executing-plans to implement the assigned task with TDD; all commits are reviewed before integration.

**Goal:** Deliver a privacy-reviewed public Corebrain repository and reproducible install packages containing the gallery plugin and paired browser extension.

**Architecture:** Keep the plugin at root and extension in extension/. Use a token-authenticated loopback bridge with configurable port, preserving the installed plugin ID and local path aliases.

**Tech Stack:** Node.js CommonJS plugin, TypeScript/Webpack extension, node:test and Vitest, GitHub releases.

**Spec:** docs/plans/2026-09-18-corebrain-design.md

## Global Constraints

- Plugin ID clippings-gallery; display Corebrain; plugin 0.3.0 and extension 1.8.0.
- No production user data or secrets in Git, test fixtures, console output or packages.
- External model requests and X imports use the installer's own credentials/session.
- Preserve current builds until replacement artifacts are verified.
- Test first for each behavioral change. Do not auto-publish from worker branches.

### Task 1: Plugin regressions

**Files:** main.js UI, image and translation routines; tests/plugin-regressions.test.cjs and test helper.
**Interfaces:** unchanged plugin public methods; bridge/settings/onload changes reserved for Task 2. Rename metadata hooks can be wired via a helper method for integration.
- [ ] Execute existing node test.js baseline.
- [ ] Add failing tests that exercise the real classes via a mocked obsidian boundary: blocked covers => zero successes; second-image failure retries second image; partial translation remains pending; manual scroll cancels restore; renamed paths remain in saved search; irrelevant metadata changes don't redraw; duplicate bulk starts don't overlap.
- [ ] Implement minimum corrections and show red/green evidence per bug.
- [ ] Run node test.js and node --test tests/plugin-regressions.test.cjs; commit scoped changes.

### Task 2: Authenticated bridge and fresh-install defaults

**Files:** main.js Receptor, settings/defaults/loading; extension/src/utils/x-bookmarks.ts; new extension bridge settings module and associated tests; settings integration; bookmark sync default folder.
**Interfaces:** Authorization: Bearer <installation token>; loopback address http://127.0.0.1:<port>; authenticated /ping, /tem, /clip, /x-bookmarks; protocol version in ping; extension local storage keys corebrain_bridge_port, corebrain_bridge_token. Plugin cfg ponteToken; generation with crypto.randomBytes(32).toString('hex') only if absent.
- [ ] Add failing HTTP tests: null origin/unknown origin denied, missing/wrong token denied, valid extension origin plus token works, OPTIONS doesn't expose authenticated data, malformed folder cannot escape vault, occupied port doesn't throw ReferenceError.
- [ ] Add failing extension tests for configured port/token, connection status and no auth-error URI bypass; normalize shared default clipping folder to Clippings.
- [ ] Implement token generation/persistence and pairing UI on both sides; validate request shape, route, body limits and folder paths; fix PORTA handler.
- [ ] Run existing and new bridge tests and extension tests; commit scoped changes.

### Task 3: Branding and release pipeline

**Files:** manifest.json, versions.json, extension/package*.json and manifests; scripts/package-release.py and tests; README.md, docs/INSTALL.md, docs/FEATURES.md; .github/workflows/ci.yml; extension timezone fixture test.
**Interfaces:** release/Corebrain-plugin-0.3.0.zip (clippings-gallery/ with only runtime assets), release/Corebrain-extension-chrome-1.8.0.zip (manifest at root), optional Firefox development ZIP, SHA256SUMS. Root plugin assets also available separately for community installation compatibility.
- [ ] Test packaging using temporary fixtures, verifying archive root, missing required asset failure and private-file exclusion.
- [ ] Brand visible manifests and package metadata without falsely claiming official upstream status. Preserve licenses and attribution.
- [ ] Implement deterministic packaging with allowlisted plugin files and built extension assets only; never data.json, profiles, .env, source maps or credentials.
- [ ] Document fresh install, token pairing, port config, own model key/X login, all features and platform/signing limitations.
- [ ] Fix timezone fixture test in a portable way and provide CI test/build/package steps. Commit changes.

### Task 4: Privacy, integration and verification

**Files:** root integration changes only after worker commits; privacy policy, sanitized public snapshot if needed.
- [ ] Scan all Git history with gitleaks --redact and inspect findings without printing credentials.
- [ ] Inspect tracked filenames/text for personal paths, configuration, copied private notes and real saved links; preserve an offline private backup before any history remediation.
- [ ] Integrate worker commits and run all tests and production builds.
- [ ] Exercise authenticated extension-to-plugin contract against isolated vault fixtures, verify downloaded/packaged manifests and assets, and obtain independent review.
- [ ] Confirm current personal installation settings survive upgrade; pair locally without logging tokens. Do not import real bookmarks or invoke paid models merely for verification.

### Task 5: Publish

- [ ] Publish to the new Corebrain repository from a clean, audited source snapshot (new Git history); keep it private until history/artifacts are approved. Preserve previous repositories privately because historical owner email metadata must not become reachable publicly.
- [ ] Push verified main branch and release tag, then make repository public.
- [ ] Upload verified ZIPs, checksums and standalone plugin assets to v0.3.0 release.
- [ ] Update old private extension repository README to direct development/installations to Corebrain without deleting source history or changing its privacy unnecessarily.
- [ ] Verify public URLs/download checksums and report tests, limitations, artifacts and configuration steps honestly.
