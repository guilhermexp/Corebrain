# Local search and arrival ordering

Approved by the user: accent-insensitive, case-insensitive all-term search in any order across title, original title/description, description, source, basename, tags, author and Markdown body. Local cached body index, no AI/network. Highlight matches using text nodes and mark elements, never innerHTML. Expose body-match snippets where visible metadata has no match. Keep search input DOM/focus/selection stable while refreshing results.

New captures receive immutable ISO `corebrain_added_at`, distinct from `created` and `published`; legacy notes fall back to file ctime without bulk modification. Editing, translation and cover changes must not promote notes. Default newest-arrival-first applies to searches too. Explicit alternate sorts remain available but are accurately labeled. Deterministic tie-break by path. Register arrival on genuine new notes, not startup cache enumeration; preserve already valid timestamps.

Changes stay in bundled main.js/styles.css so four-file plugin installation remains valid. No dependencies. Tests use synthetic notes only. Existing metadata/image optimization and scroll protections must remain. Clean up pending reads/timers on view close, coalesce asynchronous index refresh and discard stale read results. Release plugin 0.4.0 after tests/review; preserve private configuration and bridge token.
