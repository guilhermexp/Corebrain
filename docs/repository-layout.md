# Repository layout

Corebrain keeps the Obsidian plugin and browser extension in one repository:

```text
Corebrain/
  main.js                 # Obsidian plugin runtime
  manifest.json           # plugin ID/name/version
  styles.css              # plugin styles
  LICENSE
  test.js                 # plugin unit tests
  scripts/
    package-release.py    # deterministic release packager
  tests/                  # packager tests and temporary fixtures
  extension/
    src/                  # extension source and manifests
    package.json
    package-lock.json
    dist/                  # Chrome/Edge production build (ignored)
    dist_firefox/          # Firefox development build (ignored)
  docs/
    INSTALL.md
    FEATURES.md
```

The plugin archive has a stable `clippings-gallery/` root so it can be copied
to an Obsidian vault without changing the historical plugin ID. The extension
archives have `manifest.json` at their root and contain only built runtime
assets.

## Local verification

```sh
node test.js
npm --prefix extension ci
npm --prefix extension test
npm --prefix extension run build:chrome
npm --prefix extension run build:firefox
python3 -m unittest discover -s tests -p 'test_*.py'
python3 scripts/package-release.py --include-firefox
```

The template fixture suite normalizes the expected local offset for its frozen
instant, so contributors do not need to set `TZ`. Release ZIP contents are
allowlisted and checked for private files, source maps and missing manifest
references before they are written.

## Upstream attribution

The extension source was derived from the open-source Obsidian Web Clipper.
Upstream notices, copyright and third-party license information remain in
`extension/LICENSE`. Corebrain's branding, package metadata and canonical home
are independent of the upstream product and do not imply an official Obsidian
release.
