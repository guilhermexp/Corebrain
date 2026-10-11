import { isRestrictedUrl } from './active-tab-manager';
interface PanelTab { id?: number; url?: string }
interface PanelLauncher {
 ensureContent: (tabId: number) => Promise<unknown>;
 send: (tabId: number, message: {action: string}) => Promise<unknown>;
 openIndependentPanel: (tabId?: number) => Promise<unknown>;
}
/** Keep restricted pages usable without pretending they support an overlay. */
export async function launchFloatingPanel(tab: PanelTab | undefined, deps: PanelLauncher, ensureOpen = false): Promise<void> {
 const id=tab?.id;
 if (id !== undefined && tab?.url && /^https?:\/\//.test(tab.url) && !isRestrictedUrl(tab.url)) {
  try {
   await deps.ensureContent(id);
   const response=await deps.send(id,{action:ensureOpen ? 'open-floating-panel' : 'toggle-floating-panel'}) as {success?:boolean}|undefined;
   if(response?.success) return;
  } catch { /* Browser policy or a tab navigation can prevent injection. */ }
 }
 await deps.openIndependentPanel(id);
}
