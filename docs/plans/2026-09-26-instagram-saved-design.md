# Instagram saved posts → Corebrain

Approved scope: Todos os salvos, initiated explicitly from the extension, existing logged-in Instagram tab, importing posts/reels to Clippings through authenticated local bridge. Collections selection is excluded.

Reuse the gallery's serialized batch writer and immutable arrival stamps. A new `/instagram-saved` route accepts the same `{pasta,bookmarks:[{nome,conteudo,source}]}` envelope as X, with Instagram-specific labels and canonical shortcode identity across `/p/`, `/reel/`, `/reels/` URLs; preserve full-source-set equality for destructive cleanup. Existing notes must not be rewritten.

The extension reads Instagram's same-origin saved-post feed from a logged-in Instagram tab using scripting. Credentials remain in the browser; no passwords/cookies/session headers are forwarded to the bridge or logged. Parse expected JSON, reject login/challenge/429/schema failures clearly, bound pagination and detect cursor cycles. Preserve response order, deduplicate response IDs, do not infer save dates from publication dates. Initial MVP scans all pages each run and relies on authoritative vault dedup, avoiding missing items after marker/account changes.

Import requires the paired plugin; no uncontrolled URI fallback. Collect a complete list before writing, then send oldest chunks before newest while each chunk remains newest-first. Cancellation and partial errors must be visibly partial, never “all up to date”. One Instagram sync job at a time, status available when reopening popup. Explicit request timeout and conservative pacing; no retry on rate limits/challenges.

Metadata: safely serialized title/author/description/source/published/image; markdown body caption, source and media links. No binary video downloads. Attempt local cover download via existing plugin cover machinery for newly created notes only; failure is a warning and must not delete a successfully created clipping. Preserve source URL for recovery.

Validate synthetic feed/parser/pagination and integration tests, plugin canonicalization/import replay/order tests, existing X tests, TypeScript/build. Live Instagram account behavior is a separate acceptance check and must not be claimed from mocks. No commit/push or publishing bundled dirty work without user request.
