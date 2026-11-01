import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

describe('X session permissions', () => {
	for (const name of ['firefox', 'safari']) {
		it(`${name} can access X session cookies`, () => {
			const manifest: { permissions: string[]; host_permissions: string[] } =
				JSON.parse(readFileSync(`src/manifest.${name}.json`, 'utf8'));
			expect(manifest.permissions).toContain('cookies');
			expect([...manifest.permissions, ...manifest.host_permissions]).toContain('*://*.x.com/*');
		});
	}
});
