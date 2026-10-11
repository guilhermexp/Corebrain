import { describe, expect, it, vi } from 'vitest';
import { launchFloatingPanel } from './floating-launcher';
const setup = () => ({ ensureContent: vi.fn().mockResolvedValue(undefined), send: vi.fn().mockResolvedValue({ success: true }), openIndependentPanel: vi.fn().mockResolvedValue(undefined) });
describe('floating panel launcher', () => {
 it('opens the in-page panel on ordinary websites without a native popup', async () => {
  const deps=setup(); await launchFloatingPanel({id:7,url:'https://instagram.com/'},deps);
  expect(deps.ensureContent).toHaveBeenCalledWith(7); expect(deps.send).toHaveBeenCalledWith(7,{action:'toggle-floating-panel'}); expect(deps.openIndependentPanel).not.toHaveBeenCalled();
 });
 it.each(['chrome://settings/','about:blank','https://chromewebstore.google.com/detail/test'])('uses the independent panel on restricted URL %s',async url=>{
  const deps=setup();await launchFloatingPanel({id:7,url},deps);expect(deps.ensureContent).not.toHaveBeenCalled();expect(deps.openIndependentPanel).toHaveBeenCalledWith(7);
 });
 it('can ensure an existing panel stays open for quick capture', async()=>{const deps=setup();await launchFloatingPanel({id:7,url:'https://example.com/'},deps,true);expect(deps.send).toHaveBeenCalledWith(7,{action:'open-floating-panel'});});
 it('falls back when injection is blocked', async()=>{const deps=setup();deps.ensureContent.mockRejectedValue(new Error('blocked'));await launchFloatingPanel({id:7,url:'https://example.com/'},deps);expect(deps.openIndependentPanel).toHaveBeenCalledWith(7);});
 it('falls back when the tab rejects the panel message',async()=>{const deps=setup();deps.send.mockResolvedValue({success:false});await launchFloatingPanel({id:7,url:'https://example.com/'},deps);expect(deps.openIndependentPanel).toHaveBeenCalledWith(7);});
});
