# Corebrain Web Clipper

This directory contains the browser extension for
[Corebrain](https://github.com/guilhermexp/Corebrain), an **unofficial fork**
that pairs with the Corebrain Obsidian plugin. It is not an official Obsidian
extension or store release. Install and configure it using the repository's
[installation guide](../docs/INSTALL.md) and review the
[feature inventory](../docs/FEATURES.md).

The extension is distributed under the MIT License; preserve the
[extension license and attribution](LICENSE) when redistributing it. The code
originated from the open-source Obsidian Web Clipper project and retains
upstream notices and third-party licenses where applicable.

## Development

```sh
npm ci
npm test
npm run build:chrome
npm run build:firefox
```

Chrome/Edge use `dist/` as an unpacked extension. Firefox uses `dist_firefox/`
as a temporary unsigned development add-on; persistent normal Firefox
installation requires a signed package. Safari signing is outside this
release. The browser extension's visible identity is **Corebrain Web Clipper**
and its Firefox ID is `corebrain-clipper@guilhermexp.github.io`, distinct from
the upstream extension ID.
