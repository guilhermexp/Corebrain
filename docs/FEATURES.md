# Corebrain feature inventory

Corebrain combines a desktop Obsidian gallery with an unofficial browser
clipper. Availability can depend on the source site's metadata, the user's
login and external API availability.

## Obsidian plugin

- **Gallery grid and list views** with masonry layout, image-aware cards,
  sorting, search and adjustable card/row sizing.
- **Filters and organization** by source, tags, collections and favorites.
  Cards can be dragged into collections; configured collections remain visible
  before they contain a note.
- **Saved searches** are available through the plugin/API data model. There is
  currently no dedicated saved-search management UI; do not assume the gallery
  displays a saved-search editor.
- **Clip creation** from a URL, including title, description, source, image and
  other page metadata. A link can be pasted or dragged into the gallery.
- **X bookmark import** through the authenticated local bridge. Bookmark
  metadata is normalized into the same clipping format.
- **Images and covers**, including local covers, retries for missing images and
  a carousel for additional images in a note. GIF images can be selected as the
  cover when available.
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

The bridge is loopback-only and requires the installation token. Pairing uses
`127.0.0.1`, a configurable port and `Authorization: Bearer <token>`; the
extension keeps the port and token in `storage.local`. Credentials and X
sessions belong to each installer and are never release inputs. See
[INSTALL.md](INSTALL.md) for platform setup and [PRIVACY.md](../PRIVACY.md) for
the release boundary.
