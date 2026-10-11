// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import browser from 'webextension-polyfill';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { formatInstagramSyncStatus, initInstagramSync } from './instagram-sync-ui';
import type { InstagramSyncStatus } from './instagram-sync';
const base: InstagramSyncStatus = {running:false,phase:'idle',found:0,processed:0,total:0,pages:0,created:0,skipped:0,errors:0,completeScan:false,cancelRequested:false,warnings:[],updatedAt:0};
describe('Instagram saved sync popup messages',()=>{
 it('shows skipped and error counts even when no notes were created',()=>{
  const text=formatInstagramSyncStatus({...base,phase:'partial',found:4,skipped:2,errors:2,error:'Duas notas não foram enviadas.'});
  expect(text).toContain('Importação parcial'); expect(text).toContain('0 criados');expect(text).toContain('2 já existiam');expect(text).toContain('2 erros');expect(text).not.toMatch(/tudo em dia|nenhum.*novo/i);
 });
 it('never formats a cancelled job as a successful empty import',()=>{
 const text=formatInstagramSyncStatus({...base,phase:'cancelled'});expect(text).toMatch(/^Importação cancelada/);expect(text).toContain('0 erros');expect(text).not.toContain('Importação concluída');
 });
 it('explains how to proceed when the bridge is unavailable',()=>{
 const text=formatInstagramSyncStatus({...base,phase:'error',error:'Corebrain não respondeu. Ative o plugin e confira o pareamento.'});expect(text).toContain('Corebrain não respondeu');expect(text).toContain('0 erros');
 });
});
describe('Instagram popup click feedback', () => {
 let send: ReturnType<typeof vi.spyOn>;
 let broadcast: (message: unknown) => unknown;
 const flush = async () => { for(let i=0;i<10;i++) await Promise.resolve(); };
 const text = () => document.getElementById('instagram-sync-texto')!.textContent!;
 const visible = () => !document.getElementById('instagram-sync-status')!.classList.contains('is-hidden');
 beforeEach(() => {
  vi.useFakeTimers();
  document.body.innerHTML = `<a id="instagram-sync" href="#">Instagram</a><div id="instagram-sync-status" class="is-hidden"><span id="instagram-sync-texto"></span><a id="instagram-sync-cancelar"></a><div id="instagram-sync-progresso"></div></div>`;
  send=vi.spyOn(browser.runtime,'sendMessage');
  vi.spyOn(browser.runtime.onMessage,'addListener').mockImplementation((listener) => { broadcast=listener as typeof broadcast; });
 });
 afterEach(() => { vi.restoreAllMocks(); vi.useRealTimers(); document.body.innerHTML=''; });
 it('shows immediate feedback before background responds and ignores delayed idle', async () => {
  let resolveInitial!: (v: unknown) => void;
  send.mockImplementation((message: any) => message.action==='instagram-saved-status' ? new Promise(r=>{resolveInitial=r;}) : new Promise(()=>{}));
  initInstagramSync();
  document.getElementById('instagram-sync')!.click();
  expect(visible()).toBe(true);
  expect(text()).toMatch(/iniciando/i);
  resolveInitial(base); await flush();
  expect(visible()).toBe(true); expect(text()).toMatch(/iniciando/i);
 });
 it('retains a start failure rather than hiding it with an idle snapshot', async () => {
  send.mockImplementation(async (message: any) => message.action==='instagram-saved-status' ? base : {success:false,error:'Worker indisponível'});
  initInstagramSync(); await flush(); document.getElementById('instagram-sync')!.click(); await flush();
  expect(visible()).toBe(true); expect(text()).toContain('Worker indisponível');
  expect(document.getElementById('instagram-sync')!.classList.contains('esta-sincronizando')).toBe(false);
 });
 it('shows an actionable timeout without claiming the import stopped', async () => {
  send.mockImplementation((message: any) => message.action==='instagram-saved-status' ? Promise.resolve(base) : new Promise(()=>{}));
  initInstagramSync(); await flush(); document.getElementById('instagram-sync')!.click();
  await vi.advanceTimersByTimeAsync(16000);
  expect(visible()).toBe(true); expect(text()).toMatch(/resposta|respondeu/i); expect(text()).toMatch(/reabr|recarreg/i);
 });
 it('reports an empty start reply instead of silence', async () => {
  send.mockImplementation(async (message: any) => message.action==='instagram-saved-status' ? base : undefined);
  initInstagramSync(); await flush(); document.getElementById('instagram-sync')!.click(); await flush();
  expect(visible()).toBe(true); expect(text()).toMatch(/resposta|confirmar/i);
 });
 it('does not replace newer broadcast progress with an older start reply', async () => {
  let reply!: (v: unknown)=>void;
  send.mockImplementation((message: any) => message.action==='instagram-saved-status' ? Promise.resolve(base) : new Promise(r=>{reply=r;}));
  initInstagramSync(); await flush(); document.getElementById('instagram-sync')!.click();
  broadcast({action:'instagram-saved-progress',status:{...base,running:true,phase:'fetching',found:42,pages:2,updatedAt:20}});
  reply({success:true,status:{...base,running:true,phase:'checking-bridge',updatedAt:10}}); await flush();
  expect(text()).toContain('42');
 });
 it('preserves a confirmed completion when the start acknowledgement times out', async () => {
  send.mockImplementation((message: any) => message.action==='instagram-saved-status' ? Promise.resolve(base) : new Promise(()=>{}));
  initInstagramSync(); await flush(); document.getElementById('instagram-sync')!.click();
  broadcast({action:'instagram-saved-progress',status:{...base,phase:'complete',found:3,created:3,updatedAt:20}});
  await vi.advanceTimersByTimeAsync(16000);
  expect(text()).toContain('Importação concluída'); expect(text()).toContain('3 criados');
 });
 it('shows cancellation requested even when the timestamp and counts tie', async () => {
  send.mockResolvedValue(base); initInstagramSync(); await flush();
  const state={...base,running:true,phase:'fetching',found:3,pages:1,updatedAt:20};
  broadcast({action:'instagram-saved-progress',status:state});
  broadcast({action:'instagram-saved-progress',status:{...state,cancelRequested:true}});
  expect(text()).toContain('Cancelando');
 });
 it('preserves confirmed cancellation when its acknowledgement times out', async () => {
  send.mockImplementation((message: any) => message.action==='instagram-saved-status' ? Promise.resolve(base) : new Promise(()=>{}));
  initInstagramSync(); await flush();
  broadcast({action:'instagram-saved-progress',status:{...base,running:true,phase:'fetching',updatedAt:20}});
  document.getElementById('instagram-sync-cancelar')!.click();
  broadcast({action:'instagram-saved-progress',status:{...base,phase:'cancelled',updatedAt:21}});
  await vi.advanceTimersByTimeAsync(16000);
  expect(text()).toContain('Importação cancelada'); expect(text()).not.toContain('respondeu');
 });
 it('ships the Instagram trigger and status in the side panel too', () => {
  document.body.innerHTML=readFileSync(resolve('src/side-panel.html'),'utf8');
  expect(document.getElementById('instagram-sync')).not.toBeNull();
  expect(document.getElementById('instagram-sync-status')).not.toBeNull();
 });
});
