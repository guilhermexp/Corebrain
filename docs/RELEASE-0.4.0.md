# Corebrain 0.4.0

Corebrain 0.4.0 adds local all-term search across clipping metadata and
Markdown body text. Matching is case- and accent-insensitive, highlights are
safe text-node marks, body-only matches can include a snippet, and search
results default to newest arrival first.

New captures receive an immutable `corebrain_added_at` timestamp. Existing
notes use file creation time as a fallback; upgrading does not rewrite notes or
perform a bulk backfill. The plugin ID remains `clippings-gallery` so existing
installations can upgrade in place.

The plugin artifact is `Corebrain-plugin-0.4.0.zip`. The browser extension
remains version 1.8.0, unchanged; existing extension installations do not need
to be reinstalled for these plugin improvements.

## Validation

- 51 plugin/search/HTTP tests, 659 extension tests and 10 packaging tests passed.
- Native Obsidian reload confirmed version0.4.0, working authenticated bridge,
  unchanged pairing token and no legacy timestamp backfill.
- Native search smoke checks confirmed matching results, highlights, retained
  input identity/caret through background refreshes, and newest-first ordering.
- Release ZIP checksums verified; secret scanning of the release changes found
  no secrets. No personal notes or settings are included in release artifacts.

All search processing remains local; no model key or external search service
is required. The first body search builds an in-memory index and displays a
progress status. Files that cannot be read are reported without blocking other
results. Existing explicit A–Z/oldest-first choices remain available.
