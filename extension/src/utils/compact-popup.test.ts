// @vitest-environment jsdom
import { expect, it } from 'vitest';
import { initCompactPopup } from './compact-popup';
it('toggles extra controls and updates concise status without discarding error details', async () => {
 document.body.innerHTML = `<button id="capture-controls-toggle" aria-expanded="false"></button><section id="capture-controls" hidden></section><div id="instagram-sync-status" class="tem-erro"><summary id="instagram-sync-summary"></summary><span id="instagram-sync-texto">Long original error</span></div>`;
 initCompactPopup();
 document.getElementById('capture-controls-toggle')!.click();
 expect(document.getElementById('capture-controls')!.hidden).toBe(false);
 expect(document.getElementById('capture-controls-toggle')!.getAttribute('aria-expanded')).toBe('true');
 expect(document.getElementById('instagram-sync-summary')!.textContent).toContain('não concluído');
 expect(document.getElementById('instagram-sync-texto')!.textContent).toBe('Long original error');
 document.getElementById('instagram-sync-status')!.className='esta-sincronizando';
 await Promise.resolve();
 expect(document.getElementById('instagram-sync-summary')!.textContent).toContain('Sincronizando');
});
