import path from 'node:path';
import vscode from 'vscode';
import {
	MINIMUM_NATIVE_TYPESCRIPT_VERSION,
	has_content_mapper_protocol,
} from '@tsrx/typescript-plugin/src/typescript-version.js';
import {
	TSDK_SETTING_NAMES,
	TYPESCRIPT_7_NIGHTLY_EXTENSION,
	USE_TSGO_SETTINGS,
	project_typescript,
	typescript_7_compiler,
	typescript_7_on,
	typescript_7_server_extension,
	workspace_config_base,
} from './typescript-7.js';

const SETUP_URL =
	'https://github.com/tsrx-org/tsrx/tree/main/packages/vscode-plugin#native-backend-setup';
const TYPESCRIPT_7_EXTENSION = 'TypeScriptTeam.native-preview';
const FIX_COMMAND = 'tsrx.typescript.fix';

/**
 * Which TypeScript serves a `.tsrx` file:
 * - `vscode`: VS Code's own TypeScript (5.9 or 6) through `@tsrx/typescript-plugin`.
 * - `typescript-7`: the TypeScript 7 extension, with a compiler that runs the mapper.
 * - `typescript-7-unsupported`: the TypeScript 7 extension, with a compiler that
 *   cannot (the stable 7.0 line, an older nightly), so nothing checks the file.
 * - `typescript-7-missing`: TypeScript 7 is on, which turns VS Code's own TypeScript
 *   off, but only the TypeScript 7 Nightly extension is installed, which has no server.
 *
 * `project` is the `typescript` package the file's project installs.
 * @typedef {{
 * 	kind: 'vscode' | 'typescript-7' | 'typescript-7-unsupported' | 'typescript-7-missing',
 * 	version?: string,
 * 	project?: { version: string, directory: string },
 * }} TypeScriptStatus
 */

/**
 * @param {import('vscode').Uri} uri
 * @returns {TypeScriptStatus}
 */
export function typescript_status(uri) {
	const project = project_typescript(uri);
	if (!typescript_7_on()) return { kind: 'vscode', project };
	const compiler = typescript_7_compiler();
	if (!compiler) return { kind: 'typescript-7-missing', project };
	const supported = compiler.version === 'unknown' || has_content_mapper_protocol(compiler.version);
	return {
		kind: supported ? 'typescript-7' : 'typescript-7-unsupported',
		version: compiler.version,
		project,
	};
}

/**
 * @typedef {{ id: string, label: string, run: () => Thenable<unknown> }} Action
 * @typedef {{
 * 	id: string,
 * 	severity: 'information' | 'warning',
 * 	title: string,
 * 	message: string,
 * 	actions: Action[],
 * }} Notice
 */

/** @type {Action} */
const INSTALL_TYPESCRIPT_7 = {
	id: 'install-typescript-7',
	label: 'Install TypeScript 7',
	run: () =>
		vscode.commands.executeCommand('workbench.extensions.installExtension', TYPESCRIPT_7_EXTENSION),
};

/** @type {Action} */
const INSTALL_NIGHTLY = {
	id: 'install-typescript-7-nightly',
	label: 'Install TypeScript 7 Nightly',
	run: () =>
		vscode.commands.executeCommand(
			'workbench.extensions.installExtension',
			TYPESCRIPT_7_NIGHTLY_EXTENSION,
		),
};

/** @type {Action} */
const OPEN_TSDK_SETTING = {
	id: 'open-tsdk-setting',
	label: 'Open Setting',
	run: () =>
		vscode.commands.executeCommand('workbench.action.openWorkspaceSettings', 'js/ts.tsdk.path'),
};

/** @type {Action} */
const TURN_OFF_TYPESCRIPT_7 = {
	id: 'turn-off-typescript-7',
	label: 'Turn Off TypeScript 7',
	// The TypeScript 7 extension's command when it runs, else the one VS Code's own
	// TypeScript keeps while it stands down. Both update the setting where it is set.
	run: async () => {
		const commands = await vscode.commands.getCommands(true);
		return vscode.commands.executeCommand(
			commands.includes('typescript.native-preview.disable')
				? 'typescript.native-preview.disable'
				: 'typescript.experimental.disableTsgo',
		);
	},
};

/** @type {Action} */
const LEARN_MORE = {
	id: 'learn-more',
	label: 'Learn More',
	run: () => vscode.env.openExternal(vscode.Uri.parse(SETUP_URL)),
};

/**
 * The project's `typescript` as `js/ts.tsdk.path` would name it: relative to where the
 * TypeScript 7 extension resolves that setting.
 * @param {string} directory
 */
function tsdk_value(directory) {
	const base = workspace_config_base();
	return base ? path.relative(base, directory) : directory;
}

/**
 * What to tell the user about a status, if anything: only setups where `.tsrx` files
 * get nothing, or a different TypeScript than their project uses.
 * @param {TypeScriptStatus} status
 * @returns {Notice | undefined}
 */
export function notice_for(status) {
	const project =
		status.project && has_content_mapper_protocol(status.project.version)
			? status.project
			: undefined;
	const turn_off = "To use VS Code's built-in TypeScript instead, click Turn Off TypeScript 7.";
	switch (status.kind) {
		case 'vscode':
			if (!project || typescript_7_server_extension()) return undefined;
			return {
				id: 'install-typescript-7',
				severity: 'information',
				title: 'Use TypeScript 7 for .tsrx files',
				message:
					'This project uses TypeScript 7. VS Code type-checks .tsrx files with its built-in TypeScript, not with TypeScript 7. To type-check them with TypeScript 7, click Install TypeScript 7.',
				actions: [INSTALL_TYPESCRIPT_7, LEARN_MORE],
			};
		case 'typescript-7-unsupported': {
			const offer_nightly = !vscode.extensions.getExtension(TYPESCRIPT_7_NIGHTLY_EXTENSION);
			const what_to_do = project
				? `Your project has version ${project.version}. To use it, click Open Setting. Then enter ${tsdk_value(project.directory)}.`
				: offer_nightly
					? `To get it, click Install TypeScript 7 Nightly. ${turn_off}`
					: turn_off;
			return {
				id: 'typescript-7-unsupported',
				severity: 'warning',
				title: 'Fix type checking in .tsrx files',
				message: `TypeScript 7 uses version ${status.version}. This version cannot type-check .tsrx files. Please use version ${MINIMUM_NATIVE_TYPESCRIPT_VERSION} or newer. ${what_to_do}`,
				actions: [
					...(project ? [OPEN_TSDK_SETTING] : []),
					...(offer_nightly ? [INSTALL_NIGHTLY] : []),
					TURN_OFF_TYPESCRIPT_7,
				],
			};
		}
		case 'typescript-7-missing':
			return {
				id: 'typescript-7-missing',
				severity: 'warning',
				title: 'Fix type checking in .tsrx files',
				message: `No TypeScript features work in .tsrx files. The TypeScript 7 Nightly extension only adds a compiler. The editor features come from the TypeScript 7 extension, which is not installed. To add it, click Install TypeScript 7. ${turn_off}`,
				actions: [INSTALL_TYPESCRIPT_7, TURN_OFF_TYPESCRIPT_7],
			};
		default:
			return undefined;
	}
}

/**
 * The language status item for `.tsrx` files.
 * @param {TypeScriptStatus} status
 * @param {Notice | undefined} notice
 */
function status_item_content(status, notice) {
	const select_version = {
		title: 'Select Version',
		command:
			status.kind === 'vscode'
				? 'typescript.selectTypeScriptVersion'
				: 'typescript.native-preview.selectVersion',
	};
	const fix = { title: 'Fix…', command: FIX_COMMAND };
	switch (status.kind) {
		case 'vscode':
			return {
				severity: vscode.LanguageStatusSeverity.Information,
				text: 'VS Code TypeScript',
				detail: 'type-checks this file',
				command: notice ? { title: 'Use TypeScript 7…', command: FIX_COMMAND } : select_version,
			};
		case 'typescript-7':
			return {
				severity: vscode.LanguageStatusSeverity.Information,
				text: `TypeScript ${status.version}`,
				detail: 'type-checks this file',
				command: select_version,
			};
		case 'typescript-7-unsupported':
			return {
				severity: vscode.LanguageStatusSeverity.Warning,
				text: `TypeScript ${status.version}`,
				detail: 'cannot type-check this file',
				command: fix,
			};
		default:
			return {
				severity: vscode.LanguageStatusSeverity.Warning,
				text: 'No type checking',
				detail: 'the TypeScript 7 extension is not installed',
				command: fix,
			};
	}
}

/** @param {string} id */
const dismissed_key = (id) => `tsrx.typescriptNotice.${id}.dismissed`;

/**
 * Show which TypeScript serves `.tsrx` files in a language status item, and tell the
 * user, once per window and situation, when that setup leaves `.tsrx` files unchecked
 * or checked by another TypeScript than the project's. "Don't Show Again" lasts for
 * the workspace. The returned object is what the editor tests read.
 * @param {import('vscode').ExtensionContext} context
 */
export function activate_typescript_guidance(context) {
	const item = vscode.languages.createLanguageStatusItem('tsrx.typescript', { language: 'tsrx' });
	item.name = 'TSRX: TypeScript';
	/** @type {TypeScriptStatus | undefined} */
	let status;
	/** @type {Notice | undefined} */
	let notice;
	/** @type {Set<string>} */
	const shown_this_window = new Set();
	/** @type {Array<{ id: string, message: string, actions: string[] }>} */
	const shown = [];

	/** @param {Notice} notice */
	async function show(notice) {
		shown_this_window.add(notice.id);
		shown.push({
			id: notice.id,
			message: notice.message,
			actions: notice.actions.map((action) => action.label),
		});
		const dont_show_again = "Don't Show Again";
		const labels = [...notice.actions.map((action) => action.label), dont_show_again];
		const chosen = await (notice.severity === 'warning'
			? vscode.window.showWarningMessage(notice.message, ...labels)
			: vscode.window.showInformationMessage(notice.message, ...labels));
		if (chosen === dont_show_again) {
			await context.workspaceState.update(dismissed_key(notice.id), true);
		} else {
			await notice.actions.find((action) => action.label === chosen)?.run();
		}
	}

	function update() {
		const document =
			vscode.window.activeTextEditor?.document.languageId === 'tsrx'
				? vscode.window.activeTextEditor.document
				: vscode.window.visibleTextEditors.find((editor) => editor.document.languageId === 'tsrx')
						?.document;
		if (!document) return;
		status = typescript_status(document.uri);
		notice = notice_for(status);
		Object.assign(item, status_item_content(status, notice));
		if (
			notice &&
			!shown_this_window.has(notice.id) &&
			!context.workspaceState.get(dismissed_key(notice.id))
		) {
			void show(notice);
		}
	}

	update();
	context.subscriptions.push(
		item,
		vscode.window.onDidChangeActiveTextEditor(update),
		vscode.extensions.onDidChange(update),
		vscode.workspace.onDidChangeConfiguration((event) => {
			if (
				[...USE_TSGO_SETTINGS, ...TSDK_SETTING_NAMES].some((setting) =>
					event.affectsConfiguration(setting),
				)
			) {
				update();
			}
		}),
		vscode.commands.registerCommand(FIX_COMMAND, async () => {
			if (!notice) return;
			/** @type {Array<import('vscode').QuickPickItem & { run: () => Thenable<unknown> }>} */
			const items = notice.actions.map((action) => ({ label: action.label, run: action.run }));
			// The version pickers: VS Code's own while it serves TypeScript files, else the
			// TypeScript 7 extension's, which only exists when that extension is installed.
			if (status?.kind === 'vscode' || typescript_7_server_extension()) {
				items.push({
					label: 'Select TypeScript Version…',
					run: () =>
						vscode.commands.executeCommand(
							status?.kind === 'vscode'
								? 'typescript.selectTypeScriptVersion'
								: 'typescript.native-preview.selectVersion',
						),
				});
			}
			const chosen = await vscode.window.showQuickPick(items, {
				title: notice.title,
				placeHolder: notice.message,
			});
			await chosen?.run();
		}),
	);

	return {
		/** @returns {TypeScriptStatus | undefined} */
		status: () => status,
		/** The notices shown in this window, in order. */
		shown,
		/**
		 * Run one of the current notice's actions, as clicking it would.
		 * @param {string} id
		 */
		run: async (/** @type {string} */ id) =>
			notice?.actions.find((action) => action.id === id)?.run(),
	};
}
