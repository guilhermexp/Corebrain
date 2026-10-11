# Instagram Saved Import Implementation Plan

> **For agentic workers:** Execute task-by-task with TDD and independent review. Read the approved design first.

**Goal:** Import Todos os salvos from the user's Instagram session directly into Corebrain.
**Architecture:** Instagram-only extractor and sync controller reuse authenticated bridge and serialized vault writer. Stable shortcode identity prevents aliases from duplicating notes; creation order preserves feed order.
**Tech Stack:** TypeScript, WebExtension scripting, Vitest, Obsidian plugin JavaScript, node:test.
**Spec:** docs/plans/2026-09-26-instagram-saved-design.md

## Global Constraints
- Preserve all pending X, cover and frontmatter patches; no reset, remote publishing or unrelated cleanup.
- Session stays inside browser; do not log credentials or send them to vault.
- Existing clippings and original source URLs unchanged; no deletion from Instagram.
- Todos os salvos only; no collection selection or video binaries.

### Task 1: Instagram extraction and note transport
Files: new extension/src/utils/instagram-saved.ts and instagram-saved.test.ts. Export interfaces InstagramSavedPost `{id,autor,nomeAutor,texto,url,criadoEm,midia:string[]}`, InstagramSyncResult `{novos:InstagramSavedPost[],paginas:number,alcancouFim:boolean}`; functions buscarSalvosInstagram(onProgress?,deveCancelar?), enviarSalvosInstagram(posts,pasta?,onProgress?,deveCancelar?), instagramParaNota(post). Transport result `{criados,pulados,erros,cancelado?,avisos?}`.
- [x] RED: parser normalizes wrapped media, carousel/reels; malformed/login payload throws; pagination duplicate/cycle/cancel failures visible; bridge chunk order; YAML multiline safe.
```ts
expect(instagramParaNota(post).source).toBe('https://www.instagram.com/p/ABC_12/');
expect(await sendAgain()).toMatchObject({criados:0,pulados:1,erros:0});
```
- [x] Run targeted Vitest, confirm behavior absent; implement self-contained scripting fetch, bounded traversal, bridge oldest-chunk-first (max 100 notes) and safe note generation, validate transport counts.
- [x] Re-run focused tests and existing X/shared tests. Document no live API guarantee.

### Task 2: Background controller and popup
Files: extension/src/background.ts, core/popup.ts, popup.html, styles/popup.scss; new utils/instagram-sync.ts, instagram-sync-ui.ts and tests. Consume Task 1 exports. Message actions `instagram-saved-status`, `instagram-saved-sync`, `instagram-saved-cancel`, `instagram-saved-progress`; status stores running/phase/counts/error, no sensitive data.
- [x] RED: concurrent start doesn't create second job, cancellation never displays success, partial errors remain visible, reopen reads running status; pair failure prevents Instagram fetch.
```ts
expect(status.running).toBe(true);
expect(secondStart).toMatchObject({success:false});
```
- [x] Implement bounded controller with dependency injection for unit tests; require pluginDisponivel before fetch; no incremental marker, no URI fallback. Add separate IG button/status, textContent-only messages and Instagram-specific IDs.
- [x] Run controller/UI tests, TypeScript and webpack Chrome production build.

### Task 3: Vault route, identity and covers
Files: main.js and new tests/instagram-saved.test.cjs. Route `/instagram-saved` uses serialized existing writer and labels; cover download for newly created Instagram notes only, optional failures counted as warnings.
- [x] RED: /p /reel aliases canonicalize; foreign hosts never collide; repeated import creates zero; existing bytes/stamps untouched; mixed-source cleanup still requires full equality; reverse order preserved; authenticated route bounds; cover failure preserves note.
```js
assert.equal(chaveSource('https://www.instagram.com/reel/Ab_C/?igsh=1'),chaveSource('https://instagram.com/p/Ab_C/'));
assert.deepEqual({...await receptor.gravar(batch,'Clippings','Instagram')},{criados:0,pulados:1,erros:0});
```
- [x] Implement minimal extension of shared writer preserving X defaults and response compatibility; run new tests then node --test tests/*.cjs tests/*.test.mjs and node test.js.

### Task 4: Review, activation and documentation
- [x] Independent reviewer inspects integrated diff, auth/session boundary, cancellation, pagination and order; fix material findings with regression tests.
- [x] Full Vitest, plugin tests, production build; classify preexisting failures with evidence rather than silently ignore.
- [x] Reload plugin after successful review. Read-only live UI check completed; no account import.
- [ ] Reload extension in browser and validate actual Instagram API import with user.
- [x] Document exact validation evidence, remaining live-session check and browser extension reload step in docs; no git commit/push of mixed pending changes.

## Outcome
See `docs/instagram-saved-import.md` for exact results, baseline typecheck caveats and the remaining live acceptance check. Implementation and compiled Chrome build ready; browser activation/user acceptance pending.
