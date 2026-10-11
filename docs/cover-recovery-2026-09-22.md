# YouTube clipping covers — 2026-09-22

## Reproduction and causes

- Four new YouTube clippings rendered initials instead of covers. Their files contained quoted descriptions with literal, unindented newlines. Obsidian recognized the YAML section but returned no `metadataCache.frontmatter`.
- Rewriting only the description as a single-line JSON-quoted scalar restored metadata recognition. Python YAML parsing confirmed all property values were preserved.
- After metadata recovery, `buscarCapa()` still received HTTP 429 from the YouTube watch page, while the same video's `i.ytimg.com` thumbnail returned HTTP 200 and JPEG bytes.

## Changes

- Extension: JSON-quote text and multitext property values to escape embedded newlines, quotes, backslashes and control characters.
- Gallery: derive `hqdefault.jpg` only from validated YouTube video URLs/IDs, preserving OpenGraph discovery for other URLs.
- Existing affected notes: back up, normalize descriptions, recover covers. Four original cards plus two newly arriving YouTube cards were verified as loaded in the live gallery; no clipping lacked parsed frontmatter at verification time.

## Verification

- `node --test tests/*.test.cjs tests/*.test.mjs`: 63/63 passing.
- `node test.js`: passing.
- New YouTube regression failed with the simulated 429 before the fix and passed after.
- Independent review: YouTube regression 2/2 and extension shared tests 49/49.
- Reloaded the installed gallery plugin and verified live CDN resolution and loaded image dimensions.

The browser extension must load the rebuilt bundle for new captures to use the serialization fix. Source/build changes alone do not reload an already running extension. No commit or remote publication performed.
