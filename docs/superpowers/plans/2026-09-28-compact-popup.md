# Compact Popup Implementation Plan

**Goal:** Deliver the approved compact popup without changing capture or import data behavior.
**Architecture:** Keep existing capture field IDs and handlers, with internal extraction fields hidden; reorganize popup markup and scoped styles, retaining side-panel behavior. Reuse native details for capture options and existing status controllers.
**Tech Stack:** HTML, SCSS, TypeScript, Vitest/jsdom, webpack.
**Spec:** docs/plans/2026-09-28-compact-popup-design.md

## Global Constraints
Dark flat appearance, no gradients or new dependencies. Preserve all existing dirty work. No sync runs or vault mutations during tests. No added file/bookmark import features. No commit or remote publication in this task.

## Task 1 — Compact popup and regression tests
- [x] Add failing tests using real popup markup: action names, settings, default-closed options containing folder/template/vault, hidden extraction fields, unique IDs, status panels outside collapsed options.
- [x] Run focused tests and record RED.
- [x] Reorganize extension/src/popup.html; add scoped rules to extension/src/styles/popup.scss; adjust extension/src/core/popup.ts only where initial labels or existing visibility logic needs compatibility.
- [x] Verify extraction and save handlers still read populated fields, and restricted-page errors do not hide settings or sync actions. Preserve side-panel markup.
- [x] Run focused tests then full extension suite and build:chrome; inspect output and review diff independently.
- [x] Record validation and any browser reload/visual validation limitations.

## Evidence
- Initial baseline: 703 tests / 70 files passing.
- RED: compact markup requirements initially failed (5/6); share-action removal regression also failed before removal.
- Final extension suite: 711 tests / 71 files passing (`/tmp/compact-popup-tests.log`).
- Chrome build successful; 3 existing webpack bundle-size warnings (`/tmp/compact-popup-build.log`).
- Independent review: readiness dropdown, interpreter visibility, share support, initial focus findings addressed. Optional file-share entry omitted from compact popup; side-panel entry unchanged.
- Local browser visual fixture verified compact vertical actions, no text preview, and expandable folder/model options. Fixture uses production CSS and real markup with scripts removed; not an end-to-end installed extension test.
- Build generated in extension/dist; user must reload installed extension. No real imports, vault note edits, token changes, commits or pushes performed.

## Reference fidelity revision — 2026-09-28
User approved a second pass after rejecting the initial visual result. Implemented explicit UTF-8; 260px rounded charcoal popup; centered orange bookmark/short title; gray capture button; unboxed sync rows; extra controls behind top-right disclosure. Added a compact status summary retaining full errors in native details, with a tested presentation-only observer. Side-panel markup unchanged.

Validation: 713 tests / 72 files pass; Chrome build succeeds with the existing 3 bundle-size warnings. Visual browser fixture checked base state and expanded error; fixture renders real markup/production stylesheet with synthetic state, not live import. Independent reviewer identified loading-spinner caption overlap; added scoped transparent caption rule. Initial attempted RED run was blocked by missing local dependencies (not a valid red assertion); dependencies restored with npm ci. New tests pass, but that initial run is not counted as TDD evidence.

Import diagnosis: no proven code-level root cause. Popup restores persisted terminal status on open; asked user whether error is already visible on opening or occurs on a fresh click. Prior authenticated settings and worker pings do not prove import success. No speculative bridge patch, credential change or live import performed. Installed extension still needs manual reload.

## Density correction — 2026-09-28 11:24
User still found components too large and saw inner rounded outline atop square native popup. Reduced width 260→220px, primary height38→32px/font14→12px, heading20→17px, sync40→34px/font15→13px, glyph19→16px; removed 1px inner card outline. Native browser popup frame is not removed by this change; no promise of a fully transparent native surface. DOM/computed CSS regression test observed RED (260px received instead220) then GREEN. Full suite714/73 passes; Chrome build succeeds with existing3 size warnings. Local browser visual fixture verified no caption wrap, reduced density and no inner outline; installed native surface requires reload and acceptance.
