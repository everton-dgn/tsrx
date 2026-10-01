#!/usr/bin/env node

/**
 * Manual editor tests for the VS Code extension: each scenario in
 * `scenarios.js` starts a fresh, isolated VS Code instance (its own user data
 * and extensions directories, so your own VS Code and settings are never
 * touched), opens a copy of `fixtures/react`, and checks which TypeScript
 * serves its `.tsrx` file (hover, definition, and a type error typed into the
 * unsaved buffer). Run from the repository root after building the VSIX:
 *
 *   pnpm --filter @tsrx/vscode-plugin build-and-package
 *   pnpm --filter @tsrx/vscode-plugin test:editor [-- --scenario <name>] [--verbose] [--keep]
 *
 * Options: `--scenario <name>` (repeatable), `--list`, `--build` (runs
 * build-and-package first), `--vsix <path>`, `--verbose`, `--keep` (keep the
 * temporary directory). Environment: `TSRX_VSCODE_APP` (the VS Code executable)
 * and `TSRX_VSCODE_CLI` (its `code` command), which default to the macOS app.
 * Installing the TypeScript 7 extensions needs network access.
 */

import { spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import os from 'node:os';
import path from 'node:path';
import { parseArgs } from 'node:util';
import { fileURLToPath } from 'node:url';
import { SCENARIOS } from './scenarios.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const package_dir = path.dirname(here);
const repo_root = path.resolve(package_dir, '..', '..');

// `pnpm test:editor -- --flag` passes the `--` through.
const argv = process.argv.slice(2);
const { values: options } = parseArgs({
	args: argv[0] === '--' ? argv.slice(1) : argv,
	options: {
		scenario: { type: 'string', multiple: true },
		list: { type: 'boolean' },
		build: { type: 'boolean' },
		vsix: { type: 'string' },
		verbose: { type: 'boolean' },
		keep: { type: 'boolean' },
	},
});

if (options.list) {
	for (const scenario of SCENARIOS) {
		console.log(
			`${scenario.name.padEnd(30)} ${scenario.expect.padEnd(18)} ${scenario.description}`,
		);
	}
	process.exit(0);
}

const MAC_APP = '/Applications/Visual Studio Code.app';
const vscode_app =
	process.env.TSRX_VSCODE_APP ??
	(process.platform === 'darwin' ? `${MAC_APP}/Contents/MacOS/Code` : 'code');
const vscode_cli =
	process.env.TSRX_VSCODE_CLI ??
	(process.platform === 'darwin' ? `${MAC_APP}/Contents/Resources/app/bin/code` : 'code');

const SCENARIO_TIMEOUT_MS = 240_000;
const HOVER_TIMEOUT_MS = 60_000;
const DIAGNOSTIC_TIMEOUT_MS = 30_000;
const AUTO_INSERT_WAIT_MS = 3000;
const ACTION_WAIT_MS = 5000;

/** @type {Record<string, string>} */
const EXTENSION_SOURCES = {
	ts7: 'TypeScriptTeam.native-preview',
	'ts7-nightly': 'TypeScriptTeam.vscode-typescript-nightly',
};

/**
 * The environment for VS Code without the variables of the VS Code (or
 * terminal) this script runs in: `ELECTRON_RUN_AS_NODE` makes the executable
 * run as Node and reject `--user-data-dir`.
 * @returns {NodeJS.ProcessEnv}
 */
function clean_env() {
	return Object.fromEntries(
		Object.entries(process.env).filter(([key]) => !/^(ELECTRON|VSCODE)_/.test(key)),
	);
}

const selected = options.scenario?.length
	? options.scenario.map((name) => {
			const scenario = SCENARIOS.find((candidate) => candidate.name === name);
			if (!scenario) {
				console.error(`Unknown scenario "${name}". Use --list to see them.`);
				process.exit(1);
			}
			return scenario;
		})
	: SCENARIOS;

if (options.build) {
	const build = spawnSync('pnpm', ['run', 'build-and-package'], {
		cwd: package_dir,
		stdio: 'inherit',
	});
	if (build.status !== 0) process.exit(build.status ?? 1);
}

const vsix = path.resolve(options.vsix ?? path.join(package_dir, 'vscode-plugin.vsix'));
if (!fs.existsSync(vsix)) {
	console.error(
		`No VSIX at ${vsix}. Build it first: pnpm --filter @tsrx/vscode-plugin build-and-package (or pass --build).`,
	);
	process.exit(1);
}
for (const required of [vscode_app, vscode_cli]) {
	if (required.includes(path.sep) && !fs.existsSync(required)) {
		console.error(`VS Code not found at ${required}; set TSRX_VSCODE_APP / TSRX_VSCODE_CLI.`);
		process.exit(1);
	}
}
const mapper_server = path.join(repo_root, 'packages', 'content-mapper', 'dist', 'server.js');
if (!fs.existsSync(mapper_server)) {
	console.error(`${mapper_server} is missing; build-and-package builds it.`);
	process.exit(1);
}

// VS Code's IPC socket lives in the user data directory and its path must stay
// short (about 100 characters on macOS), so the whole run lives in one short
// temporary directory.
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'tsrx-vsc-'));
if (path.join(root, `u${SCENARIOS.length}`, '1.140-main.sock').length > 103) {
	console.error(
		`The temporary directory ${root} is too long for VS Code's socket; set TMPDIR to a shorter path.`,
	);
	process.exit(1);
}

/** @type {Map<string, { dir: string, installed: string[] }>} */
const extension_dirs = new Map();

/**
 * One extensions directory per extension combination, installed once per run.
 * @param {string[]} names
 */
function extensions_for(names) {
	const key = names.join('+');
	const cached = extension_dirs.get(key);
	if (cached) return cached;
	const dir = path.join(root, `ext-${extension_dirs.size + 1}`);
	fs.mkdirSync(dir, { recursive: true });
	for (const name of names) {
		const source = name === 'tsrx' ? vsix : EXTENSION_SOURCES[name];
		const install = spawnSync(
			vscode_cli,
			['--extensions-dir', dir, '--install-extension', source],
			{
				env: clean_env(),
				encoding: 'utf8',
			},
		);
		if (install.status !== 0 || !/successfully installed/i.test(install.stdout + install.stderr)) {
			throw new Error(`Could not install ${source}:\n${install.stdout}${install.stderr}`);
		}
	}
	const installed = fs
		.readdirSync(dir)
		.filter((entry) => !entry.endsWith('.json') && !entry.startsWith('.'))
		.sort();
	const entry = { dir, installed };
	extension_dirs.set(key, entry);
	return entry;
}

/**
 * @param {string} from The package whose dependency this is.
 * @param {string} name
 */
function installed_package_dir(from, name) {
	const require = createRequire(path.join(from, 'package.json'));
	return fs.realpathSync(path.dirname(require.resolve(`${name}/package.json`)));
}

const tsrx_react = path.join(repo_root, 'packages', 'tsrx-react');
const project_typescript = installed_package_dir(repo_root, 'typescript');
const project_typescript_version = JSON.parse(
	fs.readFileSync(path.join(project_typescript, 'package.json'), 'utf8'),
).version;

/**
 * A fresh copy of the fixture with its dependencies linked from the workspace.
 * @param {import('./scenarios.js').Scenario} scenario
 */
function create_project(scenario) {
	const project = path.join(root, `project-${scenario.name}`);
	fs.cpSync(path.join(here, 'fixtures', 'react'), project, { recursive: true });
	/** @type {Record<string, string>} */
	const links = {
		'@tsrx/react': tsrx_react,
		'@tsrx/content-mapper': path.join(repo_root, 'packages', 'content-mapper'),
		react: installed_package_dir(tsrx_react, 'react'),
		'@types/react': installed_package_dir(tsrx_react, '@types/react'),
	};
	if (scenario.projectTypeScript) links.typescript = project_typescript;
	for (const [name, target] of Object.entries(links)) {
		const link = path.join(project, 'node_modules', name);
		fs.mkdirSync(path.dirname(link), { recursive: true });
		fs.symlinkSync(target, link, 'junction');
	}
	return project;
}

/**
 * @param {import('./scenarios.js').Scenario} scenario
 * @param {number} index
 * @returns {Promise<{ result: Record<string, any> | undefined, installed: string[], log: string }>}
 */
async function run_scenario(scenario, index) {
	const project = create_project(scenario);
	const extensions = extensions_for(scenario.extensions);
	// Short on purpose: VS Code's IPC socket is created in it.
	const user_data = path.join(root, `u${index + 1}`);
	fs.mkdirSync(path.join(user_data, 'User'), { recursive: true });
	const settings = JSON.parse(
		JSON.stringify(scenario.settings ?? {}).replaceAll('${project}', project),
	);
	fs.writeFileSync(
		path.join(user_data, 'User', 'settings.json'),
		JSON.stringify(settings, null, 2),
	);

	const harness = path.join(root, `harness-${scenario.name}`);
	fs.cpSync(path.join(here, 'harness'), harness, { recursive: true });
	const out = path.join(root, `result-${scenario.name}.json`);
	fs.writeFileSync(
		path.join(harness, 'config.json'),
		JSON.stringify({
			scenario: scenario.name,
			file: path.join(project, 'src', 'App.tsrx'),
			out,
			hoverTimeoutMs: HOVER_TIMEOUT_MS,
			diagnosticTimeoutMs: DIAGNOSTIC_TIMEOUT_MS,
			autoInsertWaitMs: AUTO_INSERT_WAIT_MS,
			action: scenario.action,
			actionWaitMs: ACTION_WAIT_MS,
		}),
	);

	const log = path.join(root, `vscode-${scenario.name}.log`);
	const log_fd = fs.openSync(log, 'w');
	const child = spawn(
		vscode_app,
		[
			'--user-data-dir',
			user_data,
			'--extensions-dir',
			extensions.dir,
			'--disable-workspace-trust',
			'--skip-welcome',
			'--skip-release-notes',
			'--disable-telemetry',
			`--extensionDevelopmentPath=${harness}`,
			`--extensionTestsPath=${path.join(harness, 'checks.cjs')}`,
			project,
		],
		{ env: clean_env(), stdio: ['ignore', log_fd, log_fd] },
	);
	const exited = new Promise((resolve) => child.once('exit', resolve));
	const deadline = Date.now() + SCENARIO_TIMEOUT_MS;
	while (!fs.existsSync(out) && Date.now() < deadline && child.exitCode === null) {
		await new Promise((resolve) => setTimeout(resolve, 500));
	}
	// VS Code closes itself once the checks finish; make sure it is gone either way.
	if (child.exitCode === null) {
		child.kill('SIGTERM');
		const killed = await Promise.race([
			exited.then(() => true),
			new Promise((resolve) => setTimeout(() => resolve(false), 5000)),
		]);
		if (!killed) child.kill('SIGKILL');
	}
	await Promise.race([exited, new Promise((resolve) => setTimeout(resolve, 5000))]);
	fs.closeSync(log_fd);
	const result = fs.existsSync(out) ? JSON.parse(fs.readFileSync(out, 'utf8')) : undefined;
	return { result, installed: extensions.installed, log };
}

/**
 * @param {Record<string, any> | undefined} result
 * @returns {string}
 */
function served_by(result) {
	if (!result) return 'no result';
	if (result.error) return 'error';
	const type_error = (result.diagnostics ?? []).find(
		(/** @type {{ code: string }} */ diagnostic) => diagnostic.code === '2322',
	);
	const hover = /number/.test(result.hover ?? '');
	if (!hover && !type_error && (result.definitions ?? []).length === 0) return 'nothing';
	if (!hover || !type_error) return 'partial';
	if (type_error.source === 'ts') return 'typescript-7';
	if (type_error.source === 'ts-plugin') return 'vscode-typescript';
	return `unknown (${type_error.source})`;
}

console.log(`VSIX: ${vsix}`);
console.log(`Project TypeScript (projectTypeScript scenarios): ${project_typescript_version}`);
console.log(`Temporary directory: ${root}\n`);

let failures = 0;
/** @type {Array<Record<string, string>>} */
const rows = [];
for (const scenario of selected) {
	process.stdout.write(`▶ ${scenario.name}: ${scenario.description} … `);
	const { result, installed, log } = await run_scenario(scenario, selected.indexOf(scenario));
	const observed = served_by(result);
	const closing_tag = result?.closingTag ?? '';
	const status = result?.typescriptStatus?.kind ?? 'none';
	const notices =
		(result?.notices ?? []).map((/** @type {{ id: string }} */ notice) => notice.id).join(', ') ||
		'none';
	const problem =
		observed !== scenario.expect
			? `expected ${scenario.expect}, got ${observed}`
			: scenario.closingTag !== undefined && closing_tag !== scenario.closingTag
				? `expected ${JSON.stringify(scenario.closingTag)} after typing <b>, got ${JSON.stringify(closing_tag)}`
				: status !== scenario.typescript
					? `expected the TypeScript status ${scenario.typescript}, got ${status}`
					: notices !== (scenario.notice ?? 'none')
						? `expected the notices ${scenario.notice ?? 'none'}, got ${notices}`
						: scenario.check?.(result ?? {});
	if (problem) failures++;
	console.log(problem ? `FAIL (${problem})` : 'ok');
	rows.push({
		scenario: scenario.name,
		expected: scenario.expect,
		observed,
		'after typing <b>': closing_tag,
		'TypeScript status': [status, result?.typescriptStatus?.version].filter(Boolean).join(' '),
		notices,
		result: problem ? 'FAIL' : 'ok',
	});
	if (problem || options.verbose) {
		console.log(`  extensions: ${installed.join(', ')}`);
		console.log(
			`  ${JSON.stringify(result ?? { error: `no result; VS Code log: ${log}` }, null, 2).replaceAll('\n', '\n  ')}`,
		);
	}
	if (!problem && scenario.gap) console.log(`  gap: ${scenario.gap}`);
}

console.log('');
console.table(rows);
if (!options.keep) fs.rmSync(root, { recursive: true, force: true });
else console.log(`Kept ${root}`);
process.exit(failures === 0 ? 0 : 1);
