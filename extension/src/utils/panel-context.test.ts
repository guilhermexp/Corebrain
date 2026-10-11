import {expect,it} from 'vitest';
import {panelSourceTabId} from './panel-context';
it('pins the originating tab in an independent window',()=>{
 expect(panelSourceTabId('?surface=window&sourceTabId=42')).toBe(42);
 expect(panelSourceTabId('?surface=window&sourceTabId=0')).toBe(0);
});
it('rejects missing or malformed source tabs instead of pointing at its own extension window',()=>{
 for(const search of ['?surface=window','?surface=window&sourceTabId=NaN','?surface=window&sourceTabId=-1','?surface=window&sourceTabId=4.2'])expect(panelSourceTabId(search)).toBeUndefined();
 expect(panelSourceTabId('?sourceTabId=42')).toBeUndefined();
});
