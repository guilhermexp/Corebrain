/** A separate panel window must not capture its own extension tab. */
export function panelSourceTabId(search: string): number | undefined {
 const params=new URLSearchParams(search);
 if(params.get('surface') !== 'window') return undefined;
 const raw=params.get('sourceTabId');
 if(raw === null || !/^\d+$/.test(raw)) return undefined;
 const id=Number(raw);
 return Number.isSafeInteger(id) && id >= 0 ? id : undefined;
}
