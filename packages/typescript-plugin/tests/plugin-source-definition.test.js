import { spawn } from 'node:child_process';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { SOURCE_DEFINITION_COMMAND } from '../src/plugin-source-definition.js';

const package_dir = fs.realpathSync(fileURLToPath(new URL('..', import.meta.url)));
const react_package = fs.realpathSync(path.join(package_dir, 'node_modules', '@tsrx', 'react'));
const tsserver_path = createRequire(path.join(package_dir, 'package.json')).resolve(
	'typescript/lib/tsserver.js',
);

const FILES = {
	'tsconfig.json': JSON.stringify({
		compilerOptions: { jsx: 'preserve', module: 'esnext', moduleResolution: 'bundler', types: [] },
		tsrx: { compiler: '@tsrx/react' },
		include: ['src'],
	}),
	'node_modules/greeting/package.json': JSON.stringify({
		name: 'greeting',
		type: 'module',
		main: 'index.js',
		types: 'index.d.ts',
	}),
	'node_modules/greeting/index.js': `export function greet(name) {
	return 'Hello ' + name;
}
`,
	'node_modules/greeting/index.d.ts': `export declare function greet(name: string): string;
`,
	'src/App.tsrx': `export function App() {
	return <p>App</p>;
}
`,
	'src/Lib.tsrx': `import { greet } from 'greeting';
import { App } from './App.tsrx';

export function Lib() @{
	const text = greet('x');

	<div>
		{text}
		<App />
	</div>
}
`,
	'src/main.ts': `import { greet } from 'greeting';

export const text = greet('x');
`,
};

/**
 * A tsserver with `@tsrx/typescript-plugin` (this package's `dist`) as a global
 * plugin, the way VS Code hands it over (`typescriptServerPlugins`).
 * @param {string} workspace
 * @param {string} probe_location
 */
function start_tsserver(workspace, probe_location) {
	const child = spawn(
		process.execPath,
		[
			tsserver_path,
			'--globalPlugins',
			'@tsrx/typescript-plugin',
			'--pluginProbeLocations',
			probe_location,
			'--disableAutomaticTypingAcquisition',
		],
		{ cwd: workspace, stdio: ['pipe', 'pipe', 'ignore'] },
	);
	let seq = 0;
	/** @type {Map<number, (response: any) => void>} */
	const pending = new Map();
	let buffer = '';
	child.stdout.setEncoding('utf8');
	child.stdout.on('data', (chunk) => {
		buffer += chunk;
		let end;
		while ((end = buffer.indexOf('\n')) >= 0) {
			const line = buffer.slice(0, end).trim();
			buffer = buffer.slice(end + 1);
			if (!line.startsWith('{')) continue;
			const message = JSON.parse(line);
			if (message.type === 'response') pending.get(message.request_seq)?.(message);
		}
	});
	return {
		/**
		 * @param {string} command
		 * @param {unknown} args
		 * @returns {Promise<any>}
		 */
		request(command, args) {
			const id = ++seq;
			child.stdin.write(
				JSON.stringify({ seq: id, type: 'request', command, arguments: args }) + '\n',
			);
			return new Promise((resolve) => pending.set(id, resolve));
		},
		stop: () => child.kill('SIGKILL'),
	};
}

describe('tsserver plugin: Go to Source Definition in .tsrx files', () => {
	/** @type {string} */
	let workspace;
	/** @type {ReturnType<typeof start_tsserver>} */
	let server;

	beforeAll(async () => {
		workspace = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'tsrx-source-definition-')));
		for (const [name, content] of Object.entries(FILES)) {
			fs.mkdirSync(path.dirname(path.join(workspace, name)), { recursive: true });
			fs.writeFileSync(path.join(workspace, name), content);
		}
		fs.mkdirSync(path.join(workspace, 'node_modules', '@tsrx'), { recursive: true });
		fs.symlinkSync(
			react_package,
			path.join(workspace, 'node_modules', '@tsrx', 'react'),
			'junction',
		);
		// tsserver looks for global plugins in `<probe location>/node_modules`.
		const probe_location = path.join(workspace, '.probe');
		fs.mkdirSync(path.join(probe_location, 'node_modules', '@tsrx'), { recursive: true });
		fs.symlinkSync(
			package_dir,
			path.join(probe_location, 'node_modules', '@tsrx', 'typescript-plugin'),
			'junction',
		);
		server = start_tsserver(workspace, probe_location);
		for (const file of ['src/main.ts', 'src/Lib.tsrx']) {
			const full = path.join(workspace, file);
			await server.request('open', {
				file: full,
				fileContent: fs.readFileSync(full, 'utf8'),
				projectRootPath: workspace,
			});
		}
	}, 60_000);

	afterAll(() => {
		server?.stop();
		fs.rmSync(workspace, { recursive: true, force: true });
	});

	/**
	 * The `file:line:offset` of each location `command` returns for the position of
	 * `needle` (plus `skip` characters) in `file`.
	 * @param {string} command
	 * @param {string} file
	 * @param {string} needle
	 * @param {number} skip
	 */
	async function locations(command, file, needle, skip) {
		const text = FILES[/** @type {keyof typeof FILES} */ (file)];
		const before = text.slice(0, text.indexOf(needle) + skip).split('\n');
		const response = await server.request(command, {
			file: path.join(workspace, file),
			line: before.length,
			offset: before[before.length - 1].length + 1,
		});
		if (!response.success) return response.message;
		return response.body.map(
			(/** @type {any} */ span) =>
				`${path.relative(workspace, span.file)}:${span.start.line}:${span.start.offset}`,
		);
	}

	it('finds the JavaScript behind a .d.ts file from a .tsrx file', async () => {
		// The helper project tsserver builds for this reads `Lib.tsrx` through the plugin
		// too; without that, the shared document registry failed an assertion.
		expect(await locations('definition', 'src/Lib.tsrx', "greet('x')", 1)).toEqual([
			'node_modules/greeting/index.d.ts:1:25',
		]);
		expect(await locations('findSourceDefinition', 'src/Lib.tsrx', "greet('x')", 1)).toEqual([
			'node_modules/greeting/index.js:1:17',
		]);
		// The same as from a `.ts` file.
		expect(await locations('findSourceDefinition', 'src/main.ts', "greet('x')", 1)).toEqual([
			'node_modules/greeting/index.js:1:17',
		]);
	}, 60_000);

	it('keeps a .tsrx component as its own source definition', async () => {
		expect(await locations('findSourceDefinition', 'src/Lib.tsrx', '<App', 2)).toEqual([
			'src/App.tsrx:1:17',
		]);
	}, 60_000);

	it(`answers ${SOURCE_DEFINITION_COMMAND}, the request VS Code lets the TSRX extension send`, async () => {
		expect(await locations(SOURCE_DEFINITION_COMMAND, 'src/Lib.tsrx', "greet('x')", 1)).toEqual([
			'node_modules/greeting/index.js:1:17',
		]);
	}, 60_000);
});
