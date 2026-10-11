/** Compact presentation only; import controllers retain their complete status. */
export function initCompactPopup(): void {
 const toggle = document.getElementById('capture-controls-toggle');
 const controls = document.getElementById('capture-controls');
 toggle?.addEventListener('click', () => {
  if (!controls) return;
  controls.hidden = !controls.hidden;
  toggle.setAttribute('aria-expanded', String(!controls.hidden));
 });
 for (const [prefix, label] of [['instagram', 'Instagram'], ['x', 'X']]) {
  const status = document.getElementById(`${prefix}-sync-status`);
  const summary = document.getElementById(`${prefix}-sync-summary`);
  const text = document.getElementById(`${prefix}-sync-texto`);
  if (!status || !summary || !text) continue;
  const update = () => {
   summary.textContent = status.classList.contains('tem-erro')
    ? `${label} · não concluído`
    : status.classList.contains('esta-sincronizando')
     ? `Sincronizando ${label}…`
     : `${label} · ${text.textContent?.split(/[—·]/)[0].trim() || 'Status'}`;
  };
  const observer = new MutationObserver(update);
  observer.observe(status, { attributes: true, attributeFilter: ['class'] });
  observer.observe(text, { childList: true, characterData: true, subtree: true });
  update();
  window.addEventListener('unload', () => observer.disconnect(), { once: true });
 }
}
