#!/usr/bin/env node
/*
 * Regression test for the function passed to chrome.scripting.executeScript.
 * Chrome serializes `func`; module-scope helpers from background.js are not
 * carried into the Instagram page. Run the built production function in a
 * fresh VM realm with only page globals so accidental helper references fail.
 */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');

const bundlePath = path.resolve(__dirname, '../dist/background.js');
const bundle = fs.readFileSync(bundlePath, 'utf8');
const sourceFile = ts.createSourceFile(bundlePath, bundle, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);

let injectedFunctionSource;
function visit(node) {
	if (
		ts.isFunctionDeclaration(node) &&
		node.name?.text === 'buscarPaginaSalvosNoInstagram'
	) {
		injectedFunctionSource = node.getText(sourceFile);
		return;
	}
	ts.forEachChild(node, visit);
}
visit(sourceFile);
assert.ok(injectedFunctionSource, `Could not find buscarPaginaSalvosNoInstagram in ${bundlePath}`);

function makeRealm(fixture) {
	let fetchCalls = 0;
	let timerCalls = 0;
	let clearCalls = 0;
	let requestUrl;
	let requestOptions;
	let timerCallback;
	let controller;
	const pageLocation = { href: fixture.href ?? 'https://www.instagram.com/accounts/saved/' };
	const document = { cookie: fixture.cookie ?? 'csrftoken=csrf-token; sessionid=sensitive-session' };
	class PageAbortController {
		constructor() {
			controller = this;
			this.signal = { aborted: false };
		}
		abort() {
			this.signal.aborted = true;
		}
	}
	const context = vm.createContext({
		URL,
		location: pageLocation,
		document,
		AbortController: PageAbortController,
		setTimeout(callback, delay) {
			timerCalls += 1;
			assert.equal(delay, 20_000, 'uses the bounded request timeout');
			timerCallback = callback;
			if (fixture.abort) callback();
			return 41;
		},
		clearTimeout(id) {
			clearCalls += 1;
			assert.equal(id, 41);
		},
		fetch(url, options) {
			fetchCalls += 1;
			requestUrl = url;
			requestOptions = options;
			if (fixture.abort) {
				const error = vm.runInContext("new Error('request aborted')", context);
				error.name = 'AbortError';
				return Promise.reject(error);
			}
			if (fixture.fetchReject) return Promise.reject(new Error('network unavailable'));
			return Promise.resolve({
				ok: fixture.responseOk ?? true,
				status: fixture.status ?? 200,
				json: fixture.invalidJson
					? () => Promise.reject(new Error('invalid JSON'))
					: () => Promise.resolve(fixture.payload ?? { items: [{ id: 'saved-post-1' }] }),
			});
		},
	});
	const fn = vm.runInContext(`(${injectedFunctionSource})`, context, { filename: 'serialized-instagram-injection.js' });
	return {
		fn,
		getEvidence: () => ({ fetchCalls, timerCalls, clearCalls, requestUrl, requestOptions, timerCallback, controller }),
	};
}

const fixtures = [
	{
		name: 'success',
		fixture: { payload: { items: [{ id: 'saved-post-1' }] } },
		verify(result, evidence) {
			assert.equal(result.httpStatus, 200);
			assert.deepEqual(JSON.parse(JSON.stringify(result.payload)), { items: [{ id: 'saved-post-1' }] });
			assert.equal(evidence.fetchCalls, 1);
			assert.equal(evidence.requestUrl, 'https://www.instagram.com/api/v1/feed/saved/posts/');
			assert.equal(evidence.requestOptions.method, 'GET');
			assert.equal(evidence.requestOptions.credentials, 'include');
			assert.equal(evidence.requestOptions.cache, 'no-store');
			assert.equal(evidence.requestOptions.headers['x-csrftoken'], 'csrf-token');
			assert.equal(evidence.timerCalls, 1);
			assert.equal(evidence.clearCalls, 1);
		},
	},
	{
		name: 'missing csrf',
		fixture: { cookie: 'sessionid=sensitive-session' },
		verify(result, evidence) {
			assert.equal(result.semCsrf, true);
			assert.equal(evidence.fetchCalls, 0);
		},
	},
	{
		name: 'reject non-Instagram host',
		fixture: { href: 'https://evil.example/path' },
		verify(result, evidence) {
			assert.equal(result.networkError, true);
			assert.equal(evidence.fetchCalls, 0);
		},
	},
	{
		name: 'HTTP failure',
		fixture: { responseOk: false, status: 403 },
		verify(result, evidence) {
			assert.equal(result.httpStatus, 403);
			assert.equal(result.payload, null);
			assert.equal(evidence.fetchCalls, 1);
			assert.equal(evidence.clearCalls, 1);
		},
	},
	{
		name: 'invalid JSON',
		fixture: { invalidJson: true, status: 200 },
		verify(result, evidence) {
			assert.equal(result.httpStatus, 200);
			assert.equal(result.payload, null);
			assert.equal(result.networkError, true);
			assert.equal(evidence.clearCalls, 1);
		},
	},
	{
		name: 'abort timeout',
		fixture: { abort: true },
		verify(result, evidence) {
			assert.equal(result.timeout, true);
			assert.equal(result.networkError, false);
			assert.equal(evidence.controller.signal.aborted, true);
			assert.equal(evidence.clearCalls, 1);
		},
	},
];

(async () => {
	let failed = 0;
	for (const test of fixtures) {
		const { fn, getEvidence } = makeRealm(test.fixture);
		try {
			const result = await fn();
			test.verify(result, getEvidence());
			console.log(`PASS ${test.name}`);
		} catch (error) {
			failed += 1;
			console.error(`FAIL ${test.name}: ${error?.stack ?? error}`);
		}
	}
	if (failed) {
		console.error(`${failed}/${fixtures.length} Instagram injected-function fixtures failed (bundle: ${bundlePath})`);
		process.exitCode = 1;
	} else {
		console.log(`PASS ${fixtures.length} Instagram injected-function fixtures (bundle: ${bundlePath})`);
	}
})();
