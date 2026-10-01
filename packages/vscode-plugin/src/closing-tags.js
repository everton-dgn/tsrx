import vscode from 'vscode';
import { activateAutoInsertion } from '@volar/vscode';
import { USE_TSGO_SETTINGS, typescript_7_on } from './typescript-7.js';

/**
 * Whether TypeScript 7 closes JSX tags in `.tsrx` files itself. `tsc --lsp` answers
 * its closing-tag request (`_vs_onAutoInsert`) for them through the content mapper,
 * but the TypeScript 7 extension only sends that request for TypeScript and
 * JavaScript files (microsoft/TypeScript#64564). Set this to true once a fixed
 * extension ships; then remove it with TSRX's own closing tags (tsrx-org/tsrx#989).
 */
const TYPESCRIPT_7_CLOSES_TAGS = false;

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
			if (USE_TSGO_SETTINGS.some((setting) => event.affectsConfiguration(setting))) {
				update();
			}
		}),
		vscode.extensions.onDidChange(update),
	);
}
