/**
 * The built TSRX language server formatting a `.tsrx` file over stdio, as an
 * editor asks it to (`textDocument/formatting`), with the project's Prettier and
 * `@tsrx/prettier-plugin`, and saying once what to install when they are missing.
 */

import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { create_native_workspace, repo_root } from '../../content-mapper/tests/fixture-utils.js';
import { NativeLspClient } from '../../content-mapper/tests/lsp-client.js';

vi.setConfig({ testTimeout: 60_000, hookTimeout: 60_000 });

// CI builds before testing; locally: `pnpm --filter @tsrx/language-server build`.
const server_path = fileURLToPath(new URL('../dist/language-server.js', import.meta.url));

const MESSY = `export function App() @{
      const [count,setCount]=useState(0);
  <button   onClick={() => setCount(count+1)}>{count}</button>
}
`;

const FORMATTED = `export function App() @{
	const [count, setCount] = useState(0);
	<button onClick={() => setCount(count + 1)}>{count}</button>
}
`;

/** @type {Array<() => Promise<void>>} */
const cleanups = [];
afterEach(async () => {
	for (const cleanup of cleanups.splice(0)) await cleanup();
});

/**
 * A workspace with `App.tsrx` and, when `prettier` is true, the repository's
 * `prettier` and `@tsrx/prettier-plugin`, served on the plugin backend.
 * @param {{ prettier: boolean, configuration?: Record<string, unknown> }} options
 */
async function session({ prettier, configuration }) {
	if (!fs.existsSync(server_path)) {
		throw new Error(`Built language server not found at ${server_path}.`);
	}
	const workspace = create_native_workspace(
		{ 'App.tsrx': MESSY, 'package.json': '{ "name": "formatting-test", "private": true }' },
		{
			dependencies: prettier
				? [
						['prettier', repo_root],
						['@tsrx/prettier-plugin', repo_root],
					]
				: [],
		},
	);
	const client = new NativeLspClient(workspace.dir, {
		command: process.execPath,
		args: [server_path, '--stdio', '--typescript-backend=plugin'],
	});
	cleanups.push(async () => {
		await client.shutdown();
		workspace.cleanup();
	});
	await client.initialize({ configuration });
	client.open('App.tsrx', MESSY);
	/** @returns {Promise<Array<{ newText: string }> | null>} */
	const format = () =>
		client.request('textDocument/formatting', {
			textDocument: { uri: client.uri('App.tsrx') },
			options: { tabSize: 2, insertSpaces: false },
		});
	return { client, format };
}

describe('TSRX language server: formatting .tsrx files', () => {
	it('formats with the project Prettier and plugin', async () => {
		const { format } = await session({ prettier: true });
		const edits = await format();
		expect(edits).toHaveLength(1);
		expect(edits?.[0].newText).toBe(FORMATTED);
	});

	it('formats a selection with the project Prettier and plugin', async () => {
		const { client } = await session({ prettier: true });
		const line = MESSY.split('\n').findIndex((text) => text.includes('<button'));
		/** @type {Array<{ newText: string }> | null} */
		const edits = await client.request('textDocument/rangeFormatting', {
			textDocument: { uri: client.uri('App.tsrx') },
			range: { start: { line, character: 0 }, end: { line: line + 1, character: 0 } },
			options: { tabSize: 2, insertSpaces: false },
		});
		expect(edits?.[0].newText).toBe(
			MESSY.replace(
				'<button   onClick={() => setCount(count+1)}>{count}</button>',
				'<button onClick={() => setCount(count + 1)}>{count}</button>',
			),
		);
	});

	it('says once what to install when the project has no Prettier', async () => {
		const { client, format } = await session({ prettier: false });
		const message = client.wait_for_notification('window/showMessage');
		expect(await format()).toBeNull();
		expect(await message).toEqual({
			type: 2,
			message:
				'To format .tsrx files, TSRX needs prettier and @tsrx/prettier-plugin in this project. To install them, run: npm install -D prettier @tsrx/prettier-plugin',
		});
		// Format on save asks again on every save; the message stays once per project.
		const again = client.wait_for_notification('window/showMessage', () => true, 2000);
		expect(await format()).toBeNull();
		await expect(again).rejects.toThrow('Timed out');
	});

	it('does nothing with tsrx.format.enable off', async () => {
		const { client, format } = await session({
			prettier: false,
			configuration: { 'tsrx.format.enable': false },
		});
		const message = client.wait_for_notification('window/showMessage', () => true, 2000);
		expect(await format()).toBeNull();
		await expect(message).rejects.toThrow('Timed out');
	});
});
