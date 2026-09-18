# Search and Arrival Implementation Plan

> **For agentic workers:** Use executing-plans with TDD for each bounded task.

**Goal:** Reliable local search and newest-arrival-first gallery.
**Architecture:** Existing bundled plugin; cached body text per view, synchronous metadata matching, immutable arrival frontmatter in capture paths.
**Tech Stack:** CommonJS/Obsidian, node:test, TypeScript/Vitest, Python release packager.
**Spec:** docs/plans/2026-09-18-search-arrival-design.md

## Global Constraints
- `corebrain_added_at` ISO timestamp; old notes ctime fallback; never mtime/created/published for arrival ordering.
- Local processing, no personal fixtures or keys; preserve four-file plugin install.
- Plugin 0.4.0, extension unchanged unless extension source must change.

### Task 1: Arrival metadata (delegated isolated worktree)
Files: main.js capture/onload only; tests/arrival.test.cjs, bridge tests if needed.
- [ ] Test a fresh clip/bookmark/direct capture has valid `corebrain_added_at`; source dates remain intact; duplicates and subsequent edits keep original arrival.
- [ ] Run tests RED; implement capture stamping and new-file event tracking guarded against startup enumeration.
- [ ] Test legacy notes are not rewritten. Run node tests and commit.

### Task 2: Search and ordering (root)
Files: main.js GaleriaView and pure helpers, styles.css, tests/search.test.cjs.
- [ ] RED tests: `automacao` matches `Automação`; reversed words match; all terms required; author/tags/originals/body searchable; whitespace empty; ctime beats old publication date; added timestamp beats ctime; stable ties.
- [ ] Implement normalized matching and date comparator without dependencies.
- [ ] RED tests for body cache invalidation, stale pending reads, unchanged input identity/caret; implement bounded index reads and result-only redraw.
- [ ] Render safe highlighted text and match snippets in both list/card views; test literal HTML remains text.
- [ ] Run plugin regressions and new tests; commit.

### Task 3: Review, installation and release
Files: manifest.json, versions.json, packager constants/tests, CI, docs.
- [ ] Integrate Task1, run complete Node/Vitest/Python suites and independent review.
- [ ] Bump plugin0.4.0 and document arrival fallback/search semantics.
- [ ] Verify packaging/privacy/checksums. Reload actual plugin, inspect read-only runtime state; preserve all user settings except approved newest-first selection.
- [ ] Push release with verified artifacts and document exact test/validation scope.
