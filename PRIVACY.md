# Privacy

Corebrain stores captured pages as Markdown in your Obsidian vault. The plugin and
browser extension run on your computer; using them does not require a Corebrain
hosted account or backend.

## What leaves your device

- Capturing pages, fetching cover images, displaying remote images, and opening
  source pages contact the relevant websites/CDNs. Those services receive normal
  network information, including your IP address. Saved local covers reduce later
  image requests but are not a guarantee that browsing works fully offline.
- X bookmark import uses **your own logged-in browser session** to request your
  bookmarks from X. Login cookies are not included in distributed packages.
  This integration depends on X's website and can stop working when X changes it.
- Model-based translation/classification sends note titles/descriptions to the
  model endpoint you configure when you invoke those features. The extension's
  optional Interpreter sends its configured prompt/context to its configured
  provider. Review the provider's policy before sending sensitive content.
- Your own Obsidian sync, browser sync, backups, and other plugins have their own
  behavior and privacy policies; Corebrain cannot control them.

## Local credentials and pairing

The desktop plugin listens on IPv4 loopback (`127.0.0.1`), not your LAN address.
Pair the extension with the plugin's port and per-installation token. The bridge
requires a bearer token for data operations; an extension origin alone is not
authentication. Do not share the token. Rotate it if it is exposed.

The plugin's local `data.json` contains settings, saved searches, the pairing token
and any model API key you configure. These settings are **not encrypted by
Corebrain**. The extension keeps its bridge token in browser local storage.
Protect your vault, browser profile, and backups accordingly. Never upload your
`data.json`, profile or cookies when reporting a problem.

## Distributed files

Release packages are built from source and allowlisted runtime files. They do not
include the maintainer's vault, notes, model keys, pairing token, browser profile
or local configuration. The default settings are not a copy of a personal vault.

For a bug report, provide a minimal synthetic example and redact credentials,
private URLs, note contents and local usernames from logs/screenshots.
