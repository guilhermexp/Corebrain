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
remains version 1.8.0 and is released separately.
