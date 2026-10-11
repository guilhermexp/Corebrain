import {readFileSync} from 'node:fs';
import {expect,it} from 'vitest';
it('never restores the native toolbar popup, including restricted-page fallback',()=>{
 const background=readFileSync('src/background.ts','utf8');
 expect(background).not.toMatch(/action\.openPopup\s*\(/);
 expect(background).not.toContain('nativeFallback=1');
 for(const platform of ['chrome','firefox','safari']) {
  const manifest=JSON.parse(readFileSync(`src/manifest.${platform}.json`,'utf8'));
  expect(manifest.action.default_popup).toBe('');
 }
});
