# Corebrain

Corebrain is an **unofficial Obsidian plugin and browser-extension fork** for
capturing, organizing and reviewing web notes. It is not made, endorsed or
distributed by Obsidian. The canonical project home is
[github.com/guilhermexp/Corebrain](https://github.com/guilhermexp/Corebrain).

The repository contains two installable components:

- the desktop-only Obsidian plugin at the repository root (plugin ID
  `clippings-gallery`, retained so existing installations keep their settings);
- **Corebrain Web Clipper** in [`extension/`](extension/), a Chromium/Firefox
  development extension derived from the upstream open-source clipper.

The plugin and extension communicate through an authenticated loopback HTTP
bridge. See [installation](docs/INSTALL.md), the [feature inventory](docs/FEATURES.md),
[privacy notes](PRIVACY.md) and [security policy](SECURITY.md).

## Install

Download the ZIPs from [release v0.4.0](https://github.com/guilhermexp/Corebrain/releases/tag/v0.4.0), or build locally. The
plugin archive contains a `clippings-gallery/` directory with only
`main.js`, `manifest.json`, `styles.css` and `LICENSE`. The same four runtime
files are also emitted at the release directory root for manual community
plugin installation (release uploads flatten directories, so root assets are
intentional).

Corebrain 0.4.0 adds local, all-term search across clipping metadata and
Markdown body text. Search is case- and accent-insensitive, highlights matches
without treating note content as HTML, and can show a safe body snippet when a
match is not present in the visible metadata. Results default to newest arrival
first. New captures store an immutable `corebrain_added_at` timestamp; older
notes use their file creation time as a fallback without a bulk backfill.

The browser extension is installed as an unpacked extension in Chrome or Edge;
Firefox is provided only as an unsigned development build. Follow
[docs/INSTALL.md](docs/INSTALL.md) for pairing, platform limitations and build
commands.

## Development

The plugin has no runtime dependency build step:

```sh
node test.js
```

The extension uses Node.js, TypeScript and Webpack:

```sh
npm --prefix extension ci
npm --prefix extension test
npm --prefix extension run build:chrome
npm --prefix extension run build:firefox
python3 scripts/package-release.py
```

The fixture suite is timezone-independent; no `TZ` override is required.
Production builds write ignored directories under `extension/`. The packager
only accepts built assets and refuses missing manifest references. It excludes
`node_modules`, profiles, `.env*`, `data.json`, credentials and source maps.

## License and attribution

The plugin and this fork are distributed under the MIT License. Copyright and
upstream attribution remain in the root and extension `LICENSE` files. The
extension is derived from [obsidianmd/obsidian-clipper](https://github.com/obsidianmd/obsidian-clipper). The
extension contains third-party libraries with their own notices; no upstream
Obsidian trademark or store listing is implied by this repository.
