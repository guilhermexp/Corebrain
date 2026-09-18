# Corebrain 0.3.0

This suite contains the desktop Obsidian plugin **0.3.0** and Corebrain Web
Clipper **1.8.0**. It is an unofficial fork, not an official Obsidian release.

## Changes

- Unified plugin and extension source under Corebrain. The plugin ID remains
  `clippings-gallery` for settings compatibility.
- Added installation-specific bridge tokens, configurable pairing and a
  connection check. Loopback reads and writes require authentication; invalid
  origins, paths, payloads and incompatible protocols are rejected.
- Prevented simultaneous capture requests from creating duplicate notes while
  Obsidian's metadata cache catches up; preserved multibyte text in HTTP bodies.
- Corrected cover success counts, carousel retries, scroll restoration, gallery
  refresh after renames/body-image changes, incomplete translations and
  overlapping bulk jobs. Unchanged translations no longer trigger repeated API
  requests.
- Preserved X synchronization progress after partial failures and removed the
  production 50-page pagination cap. Cancellation is checked between pages.
- Added deterministic installation packages, asset validation, privacy
  exclusions, license notices and SHA-256 checksums.
- Refreshed locked dependencies to address known npm security advisories.

## Upgrade

Back up your vault and existing plugin settings, replace the plugin runtime
files, then reload it. Pair the extension with the token shown in Corebrain
settings. Each user must supply their own model API credentials and X session.
Do not copy another person's `data.json` or browser profile.

## Verification and limits

Release checks include plugin regression tests, actual loopback HTTP requests
against an isolated in-memory vault, extension unit tests, packaging tests and
production Chrome/Firefox builds. Webpack reports bundle-size warnings, not
compilation errors.

External X login/API behavior and paid model requests are not exercised against
real personal accounts during release verification. Site extraction depends on
third-party sites and can change. Chrome/Edge use unpacked installation;
Firefox is an unsigned temporary development build. Safari signing and mobile
Obsidian are not supported by this release. See [INSTALL.md](INSTALL.md).

The public repository starts from an audited source snapshot. Earlier private
repository histories are intentionally not included. Upstream licenses and
attribution are preserved.
