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

The extension and Corebrain plugin must both support bridge protocol 2.
Before each authenticated loopback request, the extension verifies the
plugin's HMAC challenge with the pairing token; an incompatible or
unverified bridge is not sent the token or clipping content. Update both
components together if pairing reports an unsupported protocol.

Saving a page requires a paired, running Corebrain bridge. If the bridge cannot
confirm the write, the page content remains available for another attempt; the
clipper does not open Obsidian as a fallback. Saving a page always creates a
clipping, even when the selected template is configured for daily notes; it
does not append or prepend to the daily note.

Instagram sync feedback shows discovered posts while scanning and the processed
total, created notes, duplicates and errors while saving. The result disappears
after four seconds (eight for errors or partial results), restoring the initial
controls. Reopening the popup does not replay an expired result; an active sync
remains visible and its work is not cancelled by closing the popup.

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
