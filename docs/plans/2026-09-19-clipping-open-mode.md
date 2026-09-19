# Configurable clipping opening

Approved: Settings offer overlay (existing default) or split view. In split mode ordinary sites and videos open their HTTP(S) original URL in a reused adjacent web viewer. Missing/invalid sources open the clipping note in that panel. Cmd/Ctrl-click remains direct note opening. Explicit Play remains an adjacent-play action. Set split mode for this user's local settings without distributing private config. No Pi integration changes in this feature.

Plan: add regression tests before implementation; route card/list clicks through one method; add persisted dropdown; reuse one owned side panel for websites and notes; handle closed panels and failed webviewer navigation without unhandled rejection. Run existing tests, independent review, reload and native QA, verify settings preserve secrets. Files: main.js, tests/open-mode.test.cjs, tests/plugin-harness.cjs (expose modal for test spy), README.md.

## Verification
- Nine focused tests written red/green. 60 gallery/bridge/search/arrival/open-mode regression tests pass.
- Independent review found closed-pane async queue and cross-site Instagram polling edge cases; both reproduced with failing tests and corrected.
- New splits anchored to the gallery; popup/click actions and modifier note opening preserved.
- Native Obsidian reload verified: one adjacent Web Viewer created, reused for second site, final GitLab URL loaded, gallery remains open. Overlay also opens; test overlay closed afterward.
- Only local `abrirClipping` preference changed to `split`; bridge pairing preserved. No note changes or credential output.
- Source committed locally; no release/publication performed by this feature task. Pi integration remains separate and incomplete.
