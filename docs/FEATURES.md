# Corebrain feature inventory

Corebrain combines a desktop Obsidian gallery with an unofficial browser
clipper. Availability can depend on the source site's metadata, the user's
login and external API availability.

## Obsidian plugin

- **Gallery grid and list views** with masonry layout, image-aware cards,
  sorting, search and adjustable card/row sizing. Search is local,
  case-insensitive and accent-insensitive, requires every term (in any order),
  and searches title, original metadata, source, basename, tags, author and
  Markdown body text. Highlights are safe text-node marks, and body-only
  matches can show a safe snippet when visible metadata has no match.
- **Arrival-aware ordering**: new captures receive an immutable
  `corebrain_added_at` timestamp and searches default to newest arrival first.
  Existing notes use file creation time as a fallback without a bulk backfill;
  edits, translations and cover changes do not promote an existing note.
- **Filters and organization** by source, tags, collections and favorites.
  Cards can be dragged into collections; configured collections remain visible
  before they contain a note.
- **Saved searches** are available through the plugin/API data model. There is
  currently no dedicated saved-search management UI; do not assume the gallery
  displays a saved-search editor.
- **Clip creation** from a URL, including title, description, source, image and
  other page metadata. A link can be pasted or dragged into the gallery.
- **X bookmark import** through the authenticated local bridge. Bookmark
  metadata is normalized into the same clipping format. Duplicate detection
  compares the post ID across renamed handles, X/Twitter domains and tracking
  parameters, without rewriting saved source URLs. Repeating a sync skips
  posts already in the gallery. Destructive duplicate cleanup requires the
  complete canonical source sets to match, not just one overlapping link.
  New bookmarks are persisted oldest-to-newest so the recent gallery order
  matches the newest-first X batch. Generated arrival stamps increase even
  within the same millisecond; existing arrivals and publication dates stay
  unchanged. A failed arrival write reports an import error; the created note
  is preserved and uses creation-time fallback (retry skips it as existing).
- **Instagram saved-post import (beta)** from the extension on an active,
  logged-in Instagram tab. Imports Todos os salvos through the paired plugin,
  without a cloud service or forwarding session credentials. Reads a complete
  feed before writing; repeated imports skip existing post shortcodes across
  post/reel URL aliases. Preserves feed order and existing notes. Includes
  progress, cancellation, partial-error reporting and optional background local
  covers for new notes. Browser reload and live-session acceptance are required
  after building. See [Instagram import](instagram-saved-import.md).
- **Images and covers**, including local covers, retries for missing images and
  a carousel for additional images in a note. GIF images can be selected as the
  cover when available (validated by file signature). Cover fetching and image
  download use a hardened direct network client with DNS rebinding and private IP
  filtering; cover requests do not use system proxy configurations or external
  authenticated sessions.
- **Collections and model assistance**: classify uncategorized notes with a
  model-compatible API and translate titles/descriptions in batches. Original
  values are retained so a translation can be reverted.
- **Undo and cleanup**: undo note deletion, clean author wikilinks that would
  create unwanted graph nodes, and keep duplicate-source warnings visible.
- **Editor integration**: collapse note properties by default, restore the
  user's navigation choice, and keep frontmatter values compatible with
  Obsidian's metadata editor.

## Browser extension

- Capture pages into durable Markdown using templates, variables and filters.
- Reader view, highlighting, selection capture, content extraction and local
  image-saving workflows.
- Template logic and schema/meta/selector variables, with import/export of
  templates and settings.
- Optional model interpretation/summaries using the installer’s own endpoint,
  model and API key.
- X bookmark synchronization through the paired Corebrain bridge, with a
  direct capture path when Obsidian is not available.
- Popup, side-panel and extension settings pages, plus keyboard commands for
  clipping, reader mode and highlighting.

## Bridge and privacy boundaries

The bridge is loopback-only and implements identity verification under **protocol 2**.
Before transmitting an authenticated request, the extension calls `GET /prova` with
a random 256-bit challenge nonce to verify the plugin's identity via HMAC-SHA256
without sending credentials to an unverified endpoint. Both plugin and extension
must be updated together to protocol 2 for pairing.

Bridge pairing uses `127.0.0.1`, a configurable port and `Authorization: Bearer <token>`.
On macOS, with Corebrain enabled, closing the vault window hides that window
instead of unloading the plugin. The bridge keeps accepting captures and writes
them without showing the window, opening the note or opening the gallery.
Quit still exits Obsidian, the Dock icon shows the existing window, and
disabling the plugin removes the handlers it installed. The behavior is
implemented by `window-lifecycle.js`, loaded in Obsidian's main process through
the `@electron/remote` already shipped with Obsidian. It is not a separate
daemon and it does not patch the Obsidian binary.
Sensitive credentials in the plugin (bridge token and model API key) are stored via
Obsidian's native `SecretStorage` (`minAppVersion: 1.11.4`) and never persisted in
plaintext within `data.json`. The extension retains bridge settings in browser
`storage.local`. Bridge callers are restricted by CORS and origin validation to
authorized browser extensions (supporting Chrome, Firefox and Safari extension
origins `safari-web-extension:`) and reject web pages. Credentials and X
sessions belong to each installer and are never release inputs. See
[INSTALL.md](INSTALL.md) for platform setup and [PRIVACY.md](../PRIVACY.md) for
the release boundary.
