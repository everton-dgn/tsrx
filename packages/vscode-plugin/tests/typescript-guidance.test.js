import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
	activate_typescript_guidance,
	notice_for,
	typescript_status,
} from '../src/typescript-guidance.js';

const host = vi.hoisted(() => ({
	/** @type {Map<string, Record<string, unknown>>} `section.key` → scope values */
	settings: new Map(),
	/** @type {Map<string, Record<string, unknown>>} lower-case id → packageJSON */
	extensions: new Map(),
	/** @type {string[]} */
	folders: [],
	/** @type {{ document: { uri: { scheme: string, fsPath: string }, languageId: string } } | undefined} */
	active_editor: undefined,
	/** @type {string[]} */
	commands: [],
	executeCommand: vi.fn(),
	showWarningMessage: vi.fn(),
	showInformationMessage: vi.fn(),
	/** @type {Record<string, any>} */
	status_item: {},
}));

vi.mock('vscode', () => {
	/** @param {string} fsPath */
	const file = (fsPath) => ({ scheme: 'file', fsPath, path: fsPath });
	const listener = () => ({ dispose() {} });
	return {
		default: {
			workspace: {
				getConfiguration: (/** @type {string} */ section) => ({
					inspect: (/** @type {string} */ key) => ({
						key,
						...host.settings.get(`${section}.${key}`),
					}),
					get: (/** @type {string} */ key) => {
						const scopes = host.settings.get(`${section}.${key}`) ?? {};
						return scopes.workspaceValue ?? scopes.globalValue;
					},
				}),
				get workspaceFile() {
					return undefined;
				},
				get workspaceFolders() {
					return host.folders.map((folder) => ({ uri: file(folder) }));
				},
				getWorkspaceFolder: (/** @type {{ fsPath: string }} */ uri) => {
					const folder = host.folders.find((candidate) =>
						uri.fsPath.startsWith(candidate + path.sep),
					);
					return folder ? { uri: file(folder) } : undefined;
				},
				onDidChangeConfiguration: listener,
			},
			extensions: {
				getExtension: (/** @type {string} */ id) => {
					const packageJSON = host.extensions.get(id.toLowerCase());
					return packageJSON ? { id, packageJSON } : undefined;
				},
				onDidChange: listener,
			},
			window: {
				get activeTextEditor() {
					return host.active_editor;
				},
				get visibleTextEditors() {
					return host.active_editor ? [host.active_editor] : [];
				},
				onDidChangeActiveTextEditor: listener,
				showWarningMessage: host.showWarningMessage,
				showInformationMessage: host.showInformationMessage,
				showQuickPick: vi.fn(),
			},
			languages: {
				createLanguageStatusItem: () => {
					host.status_item = { dispose() {} };
					return host.status_item;
				},
			},
			commands: {
				executeCommand: host.executeCommand,
				getCommands: async () => host.commands,
				registerCommand: listener,
			},
			env: { openExternal: vi.fn() },
			Uri: { parse: (/** @type {string} */ value) => value },
			LanguageStatusSeverity: { Information: 0, Warning: 1, Error: 2 },
		},
	};
});

const NATIVE_PREVIEW = { bundledTypeScriptVersion: '7.0.2' };
const NIGHTLY = { bundledTypeScriptVersion: '7.1.0-dev.20260930.4' };

/** @type {string} */
let workspace;

/**
 * A `typescript` package as npm installs it.
 * @param {string} directory
 * @param {string} version
 */
function write_typescript(directory, version) {
	fs.mkdirSync(path.join(directory, 'lib'), { recursive: true });
	fs.writeFileSync(
		path.join(directory, 'package.json'),
		JSON.stringify({ name: 'typescript', version, bin: { tsc: './bin/tsc' } }),
	);
	// TypeScript 5 and 6 ship tsserver.js; TypeScript 7 does not.
	if (Number.parseInt(version, 10) < 7)
		fs.writeFileSync(path.join(directory, 'lib', 'tsserver.js'), '');
}

/** @param {string} section @param {string} key @param {Record<string, unknown>} scopes */
const set = (section, key, scopes) => host.settings.set(`${section}.${key}`, scopes);
const use_tsgo = () => set('js/ts', 'experimental.useTsgo', { globalValue: true });
/** @param {string} id @param {Record<string, unknown>} [packageJSON] */
const install = (id, packageJSON = {}) => host.extensions.set(id.toLowerCase(), packageJSON);

const app_file = () =>
	/** @type {import('vscode').Uri} */ (
		/** @type {unknown} */ ({ scheme: 'file', fsPath: path.join(workspace, 'src', 'App.tsrx') })
	);

beforeEach(() => {
	workspace = fs.mkdtempSync(path.join(os.tmpdir(), 'tsrx-guidance-'));
	fs.mkdirSync(path.join(workspace, 'src'));
	host.folders = [workspace];
	host.settings.clear();
	host.extensions.clear();
	host.active_editor = undefined;
	host.commands = [];
	vi.clearAllMocks();
});

afterEach(() => fs.rmSync(workspace, { recursive: true, force: true }));

describe('which TypeScript serves .tsrx files', () => {
	it("is VS Code's own TypeScript while TypeScript 7 is off, and finds the project's TypeScript", () => {
		install('TypeScriptTeam.native-preview', NATIVE_PREVIEW);
		write_typescript(path.join(workspace, 'node_modules', 'typescript'), '7.1.0-dev.20260930.4');
		expect(typescript_status(app_file())).toEqual({
			kind: 'vscode',
			project: {
				version: '7.1.0-dev.20260930.4',
				directory: path.join(workspace, 'node_modules', 'typescript'),
			},
		});
	});

	it("takes the project's nearest TypeScript and looks no higher than the workspace folder", () => {
		write_typescript(path.join(workspace, 'node_modules', 'typescript'), '6.0.3');
		write_typescript(
			path.join(workspace, 'src', 'node_modules', 'typescript'),
			'7.1.0-dev.20260930.4',
		);
		expect(typescript_status(app_file()).project?.version).toBe('7.1.0-dev.20260930.4');
		host.folders = [path.join(workspace, 'src')];
		fs.rmSync(path.join(workspace, 'src', 'node_modules'), { recursive: true });
		expect(typescript_status(app_file()).project).toBeUndefined();
	});

	it("cannot check .tsrx files with the TypeScript 7 extension's bundled 7.0", () => {
		install('TypeScriptTeam.native-preview', NATIVE_PREVIEW);
		use_tsgo();
		expect(typescript_status(app_file())).toMatchObject({
			kind: 'typescript-7-unsupported',
			version: '7.0.2',
		});
	});

	it('checks them with the TypeScript 7 Nightly extension, which it prefers to its bundled compiler', () => {
		install('TypeScriptTeam.native-preview', NATIVE_PREVIEW);
		install('TypeScriptTeam.vscode-typescript-nightly', NIGHTLY);
		use_tsgo();
		expect(typescript_status(app_file())).toMatchObject({
			kind: 'typescript-7',
			version: '7.1.0-dev.20260930.4',
		});
	});

	it('prefers a tsdk setting naming a TypeScript 7 package, resolved against the workspace folder', () => {
		install('TypeScriptTeam.native-preview', NATIVE_PREVIEW);
		install('TypeScriptTeam.vscode-typescript-nightly', NIGHTLY);
		use_tsgo();
		write_typescript(path.join(workspace, 'node_modules', 'typescript'), '7.1.0-dev.20260923.1');
		set('js/ts', 'tsdk.path', { workspaceValue: 'node_modules/typescript' });
		expect(typescript_status(app_file())).toMatchObject({
			kind: 'typescript-7',
			version: '7.1.0-dev.20260923.1',
		});
	});

	it('takes the most specific tsdk setting, and skips ones naming TypeScript 5 or 6', () => {
		install('TypeScriptTeam.native-preview', NATIVE_PREVIEW);
		use_tsgo();
		const old_nightly = path.join(workspace, 'old');
		const current_nightly = path.join(workspace, 'current');
		const typescript_6 = path.join(workspace, 'six');
		write_typescript(old_nightly, '7.1.0-dev.20260918.1');
		write_typescript(current_nightly, '7.1.0-dev.20260930.4');
		write_typescript(typescript_6, '6.0.3');
		set('js/ts', 'tsdk.path', { globalValue: current_nightly, workspaceValue: old_nightly });
		expect(typescript_status(app_file())).toMatchObject({
			kind: 'typescript-7-unsupported',
			version: '7.1.0-dev.20260918.1',
		});
		set('js/ts', 'tsdk.path', { workspaceValue: path.join(typescript_6, 'lib') });
		expect(typescript_status(app_file()).version).toBe('7.0.2');
	});

	it('serves nothing when TypeScript 7 is on with only the Nightly extension, which has no server', () => {
		install('TypeScriptTeam.vscode-typescript-nightly', NIGHTLY);
		use_tsgo();
		expect(typescript_status(app_file()).kind).toBe('typescript-7-missing');
	});

	it('reads typescript.experimental.useTsgo only while js/ts.experimental.useTsgo is not set', () => {
		install('TypeScriptTeam.native-preview', NATIVE_PREVIEW);
		set('typescript', 'experimental.useTsgo', { globalValue: true });
		expect(typescript_status(app_file()).kind).toBe('typescript-7-unsupported');
		set('js/ts', 'experimental.useTsgo', { workspaceValue: false });
		expect(typescript_status(app_file()).kind).toBe('vscode');
	});
});

describe('notices', () => {
	const project = { version: '7.1.0-dev.20260930.4', directory: '' };
	const labels = (/** @type {ReturnType<typeof notice_for>} */ notice) =>
		notice?.actions.map((action) => action.label);

	beforeEach(() => {
		project.directory = path.join(workspace, 'node_modules', 'typescript');
	});

	it('suggest the TypeScript 7 extension to a TypeScript 7 project that lacks it', () => {
		const notice = notice_for({ kind: 'vscode', project });
		expect(notice?.message).toBe(
			'This project uses TypeScript 7. VS Code type-checks .tsrx files with its built-in TypeScript, not with TypeScript 7. To type-check them with TypeScript 7, click Install TypeScript 7.',
		);
		expect(labels(notice)).toEqual(['Install TypeScript 7', 'Learn More']);
	});

	it('stay quiet while TypeScript 7 is off by choice, or the project is not on TypeScript 7', () => {
		expect(
			notice_for({ kind: 'vscode', project: { version: '6.0.3', directory: '' } }),
		).toBeUndefined();
		install('TypeScriptTeam.native-preview', NATIVE_PREVIEW);
		expect(notice_for({ kind: 'vscode', project })).toBeUndefined();
		expect(
			notice_for({ kind: 'typescript-7', version: '7.1.0-dev.20260930.4', project }),
		).toBeUndefined();
	});

	it("name the project's TypeScript and the value for js/ts.tsdk.path when TypeScript 7 cannot check .tsrx files", () => {
		const notice = notice_for({ kind: 'typescript-7-unsupported', version: '7.0.2', project });
		expect(notice?.message).toBe(
			'TypeScript 7 uses version 7.0.2. This version cannot type-check .tsrx files. Please use version 7.1.0-dev.20260923.1 or newer. Your project has version 7.1.0-dev.20260930.4. To use it, click Open Setting. Then enter node_modules/typescript.',
		);
		expect(labels(notice)).toEqual([
			'Open Setting',
			'Install TypeScript 7 Nightly',
			'Turn Off TypeScript 7',
		]);
	});

	it('offer only what applies', () => {
		expect(notice_for({ kind: 'typescript-7-unsupported', version: '7.0.2' })?.message).toBe(
			"TypeScript 7 uses version 7.0.2. This version cannot type-check .tsrx files. Please use version 7.1.0-dev.20260923.1 or newer. To get it, click Install TypeScript 7 Nightly. To use VS Code's built-in TypeScript instead, click Turn Off TypeScript 7.",
		);
		install('TypeScriptTeam.vscode-typescript-nightly', NIGHTLY);
		const notice = notice_for({ kind: 'typescript-7-unsupported', version: '7.0.2' });
		expect(notice?.message).toBe(
			"TypeScript 7 uses version 7.0.2. This version cannot type-check .tsrx files. Please use version 7.1.0-dev.20260923.1 or newer. To use VS Code's built-in TypeScript instead, click Turn Off TypeScript 7.",
		);
		expect(labels(notice)).toEqual(['Turn Off TypeScript 7']);
		const missing = notice_for({ kind: 'typescript-7-missing' });
		expect(missing?.message).toBe(
			"No TypeScript features work in .tsrx files. The TypeScript 7 Nightly extension only adds a compiler. The editor features come from the TypeScript 7 extension, which is not installed. To add it, click Install TypeScript 7. To use VS Code's built-in TypeScript instead, click Turn Off TypeScript 7.",
		);
		expect(labels(missing)).toEqual(['Install TypeScript 7', 'Turn Off TypeScript 7']);
	});
});

describe('status item and notices in the editor', () => {
	function context() {
		/** @type {Map<string, unknown>} */
		const state = new Map();
		return /** @type {import('vscode').ExtensionContext} */ (
			/** @type {unknown} */ ({
				subscriptions: [],
				workspaceState: {
					get: (/** @type {string} */ key) => state.get(key),
					update: async (/** @type {string} */ key, /** @type {unknown} */ value) => {
						state.set(key, value);
					},
				},
			})
		);
	}

	beforeEach(() => {
		host.active_editor = { document: { uri: app_file(), languageId: 'tsrx' } };
		install('TypeScriptTeam.native-preview', NATIVE_PREVIEW);
		use_tsgo();
	});

	it('names the TypeScript, and points to the fix when it cannot check the file', () => {
		host.showWarningMessage.mockResolvedValue(undefined);
		const guidance = activate_typescript_guidance(context());
		expect(guidance.status()?.kind).toBe('typescript-7-unsupported');
		expect(host.status_item).toMatchObject({
			name: 'TSRX: TypeScript',
			severity: 1,
			text: 'TypeScript 7.0.2',
			detail: 'cannot type-check this file',
			command: { title: 'Fix…', command: 'tsrx.typescript.fix' },
		});
	});

	it('shows a notice once per window, and never again after "Don\'t Show Again"', async () => {
		host.showWarningMessage.mockResolvedValue("Don't Show Again");
		const workspace_context = context();
		const first = activate_typescript_guidance(workspace_context);
		expect(first.shown.map((notice) => notice.id)).toEqual(['typescript-7-unsupported']);
		expect(host.showWarningMessage).toHaveBeenCalledWith(
			expect.stringContaining('TypeScript 7 uses version 7.0.2'),
			'Install TypeScript 7 Nightly',
			'Turn Off TypeScript 7',
			"Don't Show Again",
		);
		await vi.waitFor(() =>
			expect(
				workspace_context.workspaceState.get(
					'tsrx.typescriptNotice.typescript-7-unsupported.dismissed',
				),
			).toBe(true),
		);
		const second = activate_typescript_guidance(workspace_context);
		expect(second.shown).toEqual([]);
	});

	it('runs the chosen action', async () => {
		host.showWarningMessage.mockResolvedValue('Install TypeScript 7 Nightly');
		activate_typescript_guidance(context());
		await vi.waitFor(() =>
			expect(host.executeCommand).toHaveBeenCalledWith(
				'workbench.extensions.installExtension',
				'TypeScriptTeam.vscode-typescript-nightly',
			),
		);
	});

	it("turns TypeScript 7 off through its extension, or through VS Code's TypeScript without it", async () => {
		host.showWarningMessage.mockResolvedValue(undefined);
		const guidance = activate_typescript_guidance(context());
		await guidance.run('turn-off-typescript-7');
		expect(host.executeCommand).toHaveBeenLastCalledWith('typescript.experimental.disableTsgo');
		host.commands = ['typescript.native-preview.disable'];
		await guidance.run('turn-off-typescript-7');
		expect(host.executeCommand).toHaveBeenLastCalledWith('typescript.native-preview.disable');
	});

	it("opens the workspace setting for the project's TypeScript", async () => {
		host.showWarningMessage.mockResolvedValue(undefined);
		write_typescript(path.join(workspace, 'node_modules', 'typescript'), '7.1.0-dev.20260930.4');
		const guidance = activate_typescript_guidance(context());
		await guidance.run('open-tsdk-setting');
		expect(host.executeCommand).toHaveBeenCalledWith(
			'workbench.action.openWorkspaceSettings',
			'js/ts.tsdk.path',
		);
	});
});
