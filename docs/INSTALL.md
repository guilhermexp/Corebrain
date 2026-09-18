# Install Corebrain

Corebrain is an unofficial fork and is not an official Obsidian product. Use
the release artifacts from
[github.com/guilhermexp/Corebrain](https://github.com/guilhermexp/Corebrain),
or build them locally as described below.

## Obsidian plugin (desktop only)

1. Download `Corebrain-plugin-0.4.0.zip` and extract it.
2. Copy the contained `clippings-gallery/` directory to
   `<vault>/.obsidian/plugins/`. For a manually downloaded release, copy the
   four standalone root files (`main.js`, `manifest.json`, `styles.css` and
   `LICENSE`) into `<vault>/.obsidian/plugins/clippings-gallery/`.
3. In Obsidian, enable **Corebrain** under **Settings → Community plugins**.

The plugin ID remains `clippings-gallery` for upgrade compatibility. It is
marked desktop-only because the local bridge uses Node's HTTP APIs; mobile
Obsidian is not supported.

New captures record their arrival in the immutable `corebrain_added_at`
property, so the gallery can show newest arrivals first. Existing notes fall
back to their file creation time; installing this release does not rewrite or
bulk backfill those notes.

## Chrome and Edge (unpacked)

The supported browser installation is an unpacked build:

1. Download and extract `Corebrain-extension-chrome-1.8.0.zip`, or build
   `extension/dist/` locally.
2. Open `chrome://extensions` (or `edge://extensions`).
3. Enable **Developer mode**, choose **Load unpacked**, and select the extracted
   directory whose root contains `manifest.json`.

The Chrome manifest does not add a new signing key. Remove old unpacked copies
before loading a new copy if the browser reports a duplicate extension.

## Firefox development build

`Corebrain-extension-firefox-development-1.8.0.zip` is optional and is an
unsigned development artifact:

1. Open `about:debugging#/runtime/this-firefox`.
2. Choose **This Firefox → Load Temporary Add-on**.
3. Select `manifest.json` from the extracted build.

Temporary unsigned add-ons are removed when Firefox restarts. A normal
persistent Firefox installation requires Mozilla signing; this project does not
ship a signed store artifact. The Firefox manifest deliberately uses the
separate ID `corebrain-clipper@guilhermexp.github.io` rather than the upstream
`clipper@obsidian.md`, so it cannot overwrite the official extension.

## Safari

Safari packaging and signing are not part of this release. The Safari source
manifest remains available for development, but no signed Safari installation
is promised.

## Pair the bridge

After enabling the plugin, open **Settings → Corebrain** and note the loopback
port and installation token shown by the plugin. In the extension settings,
enter the same values and run the connection check. The extension stores these
values in browser `storage.local` under `corebrain_bridge_port` and
`corebrain_bridge_token`.

The bridge listens on `127.0.0.1` and authenticates requests with
`Authorization: Bearer <token>`. Do not publish or paste the token into URLs,
logs or bug reports. The default clipping folder is `Clippings`; change it in
the plugin settings if required. If Obsidian is unavailable, use the
extension's direct capture path instead of expecting the bridge to work.

For inline playback, enable Obsidian's built-in **Web Viewer** core plugin.

## External accounts and keys

Each installer supplies their own credentials and sessions:

- model-assisted translation, classification and interpretation use the API
  endpoint, model and key configured by that user;
- X bookmark import uses the user's own X login/session;
- no model key, cookie, browser profile or vault data is bundled in source or
  release artifacts.

## Build and package locally

From a clean checkout:

```sh
npm --prefix extension ci
npm --prefix extension test
npm --prefix extension run build:chrome
npm --prefix extension run build:firefox
python3 scripts/package-release.py
(cd release && sha256sum -c SHA256SUMS)
```

On macOS, use `(cd release && shasum -a 256 -c SHA256SUMS)` if `sha256sum` is not
available. The packager fails closed when a required runtime file or manifest
reference is missing and produces deterministic ZIP bytes.
