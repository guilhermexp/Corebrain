# Corebrain public release design

Approved scope: rename the unified gallery/clipper project to Corebrain, fix all identified defects, publish updated sources and installable artifacts, and exclude the owner's private material. Public visibility was explicitly approved on 2026-09-18 conditional on privacy review.

## Architecture and compatibility

- One Git repository: Corebrain. Obsidian plugin at root, browser extension in extension/.
- Display names Corebrain / Corebrain Web Clipper. Keep plugin ID clippings-gallery to preserve settings and installed users. Keep existing local paths through symlinks.
- Plugin version 0.3.0, extension version 1.8.0; release tag v0.3.0 for the suite.
- Desktop Obsidian only. Chrome/Edge unpacked extension is the primary installation route. Firefox unsigned development build is explicitly labeled; Firefox/Safari store signing is outside this release.
- No personal notes, data.json, authentication cookies, model keys, browser profiles or machine paths in public artifacts.

## Functional acceptance

Fix wrong image retry target, false cover success counts, incomplete translations disappearing from pending work, scroll restoration overriding user navigation, undefined PORTA error handler, saved search references after rename, gallery-wide irrelevant metadata redraws, and overlapping bulk jobs. Correct the timezone-dependent extension test without requiring the installer to set TZ.

Bridge requests must be authenticated with an installation-specific random token. Plugin settings expose pairing information; extension settings accept loopback port and token and provide a connection check. Invalid/opaque website origins, unauthenticated reads/writes and path traversal must be rejected. No credentials in URLs. The extension must surface authentication errors rather than silently bypassing the bridge with obsidian://. Keep a documented non-bridge capture path when Obsidian is genuinely unavailable.

Ship every existing feature available in UI or commands: gallery grid/list, filters, tags/collections/favorites, saved searches, clip creation, X bookmark import, image carousel/local covers, model translation/classification, undo deletion and author cleanup. Secrets and user sessions are configured by each installer, never bundled. External services remain subject to availability and login/API requirements.

## Verification and publication gates

TDD regression tests for each behavior; existing plugin and extension tests; real HTTP boundary test with isolated fake vault; production extension build; verify ZIP manifest layouts and all referenced assets; isolated fresh-install checks without modifying personal notes. Review implementation before publication. Scan working tree, Git history and release artifacts for credentials/private data. If history contains private material, do not expose it; preserve private backup and publish a clean, audited source snapshot with a new public history instead. Push only verified artifacts, create GitHub release, and make the old extension repository point to Corebrain without deleting it.
