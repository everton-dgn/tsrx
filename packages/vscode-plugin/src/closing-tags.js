import vscode from 'vscode';
import { activateAutoInsertion } from '@volar/vscode';

/**
 * Whether TypeScript 7 closes JSX tags in `.tsrx` files itself. `tsc --lsp` answers
 * its closing-tag request (`_vs_onAutoInsert`) for them through the content mapper,
 * but the TypeScript 7 extension only sends that request for TypeScript and
 * JavaScript files (microsoft/TypeScript#64564). Set this to true once a fixed
 * extension ships; then remove it with TSRX's own closing tags (tsrx-org/tsrx#989).
 */
const TYPESCRIPT_7_CLOSES_TAGS = false;

// The extensions whose presence makes VS Code's own TypeScript stand down for TypeScript 7.
const TYPESCRIPT_7_EXTENSIONS = [
	'TypeScriptTeam.vscode-typescript',
	'TypeScriptTeam.vscode-typescript-nightly',
	'TypeScriptTeam.native-preview',
];
const USE_TSGO = 'experimental.useTsgo';

/**
 * Whether TypeScript 7 serves TypeScript files, by the check VS Code's own TypeScript
 * makes to stand down: `js/ts.experimental.useTsgo` (or, when that is not set,
 * `typescript.experimental.useTsgo`) is on and a TypeScript 7 extension is installed.
 * @returns {boolean}
 */
export function typescript_7_on() {
	const unified = vscode.workspace.getConfiguration('js/ts');
	const inspected = unified.inspect(USE_TSGO);
	const use_tsgo =
		inspected &&
		[
			inspected.globalValue,
			inspected.workspaceValue,
			inspected.workspaceFolderValue,
			inspected.globalLanguageValue,
			inspected.workspaceLanguageValue,
			inspected.workspaceFolderLanguageValue,
		].some((value) => value !== undefined)
			? unified.get(USE_TSGO)
			: vscode.workspace.getConfiguration('typescript').get(USE_TSGO);
	return !!use_tsgo && TYPESCRIPT_7_EXTENSIONS.some((id) => vscode.extensions.getExtension(id));
}

/**
 * Close JSX tags in `.tsrx` files when the TypeScript that serves them does not.
 * VS Code's own TypeScript closes them through `@tsrx/typescript-plugin`
 * (`js/ts.autoClosingTags.enabled`), so the TSRX language server's closing tags
 * (`tsrx.autoClosingTags.enabled`) run only while TypeScript 7 serves `.tsrx`
 * files: with both, two providers would race to insert the same closing tag.
 * @param {import('vscode').ExtensionContext} context
 * @param {import('vscode-languageclient/node').BaseLanguageClient} client
 */
export function activate_closing_tags(context, client) {
	/** @type {import('vscode').Disposable | undefined} */
	let auto_insertion;

	function update() {
		const wanted = !TYPESCRIPT_7_CLOSES_TAGS && typescript_7_on();
		if (wanted && !auto_insertion) {
			auto_insertion = activateAutoInsertion([{ language: 'tsrx' }], client);
		} else if (!wanted && auto_insertion) {
			auto_insertion.dispose();
			auto_insertion = undefined;
		}
	}

	update();
	context.subscriptions.push(
		{ dispose: () => auto_insertion?.dispose() },
		vscode.workspace.onDidChangeConfiguration((event) => {
			if (
				event.affectsConfiguration(`js/ts.${USE_TSGO}`) ||
				event.affectsConfiguration(`typescript.${USE_TSGO}`)
			) {
				update();
			}
		}),
		vscode.extensions.onDidChange(update),
	);
}
