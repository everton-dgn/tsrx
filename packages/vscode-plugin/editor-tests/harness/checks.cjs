/**
 * Runs inside an isolated VS Code instance (`--extensionTestsPath`) started by
 * `../run.js`. Opens the fixture's `.tsrx` file, asks the editor for a hover, a
 * definition and the diagnostics of a type error typed into the unsaved
 * buffer, and writes what it saw to the `out` file named in `config.json`
 * (written next to this file by the runner). It never saves the document.
 */

const fs = require('node:fs');
const path = require('node:path');
const vscode = require('vscode');

const config = JSON.parse(fs.readFileSync(path.join(__dirname, 'config.json'), 'utf8'));

/** @param {number} ms */
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * An editor request that may never settle (a provider stuck behind a server
 * that is restarting) must not hang the run.
 * @template T
 * @param {Thenable<T>} request
 * @param {number} ms
 * @param {T} fallback
 * @returns {Promise<T>}
 */
function within(request, ms, fallback) {
	return Promise.race([Promise.resolve(request), sleep(ms).then(() => fallback)]);
}

/** @param {vscode.Hover[] | undefined} hovers */
function hover_text(hovers) {
	return (hovers ?? [])
		.flatMap((hover) =>
			hover.contents.map((content) => (typeof content === 'string' ? content : content.value)),
		)
		.join('\n')
		.replace(/\s+/g, ' ')
		.trim();
}

/** @param {string} key */
function use_tsgo(key) {
	const inspected = vscode.workspace.getConfiguration('js/ts').inspect(key);
	return { user: inspected?.globalValue, workspace: inspected?.workspaceValue };
}

exports.run = async () => {
	/** @type {Record<string, unknown>} */
	const result = { scenario: config.scenario };
	try {
		const uri = vscode.Uri.file(config.file);
		const document = await vscode.workspace.openTextDocument(uri);
		await vscode.window.showTextDocument(document);
		result.languageId = document.languageId;
		result.useTsgoAtStart = use_tsgo('experimental.useTsgo');

		const text = document.getText();
		const count_position = document.positionAt(text.indexOf('{count}') + 1);
		let hover = '';
		const hover_deadline = Date.now() + config.hoverTimeoutMs;
		while (!/number/.test(hover) && Date.now() < hover_deadline) {
			hover = hover_text(
				await within(
					vscode.commands.executeCommand('vscode.executeHoverProvider', uri, count_position),
					5000,
					[],
				),
			);
			if (!/number/.test(hover)) await sleep(1000);
		}
		result.hover = hover;

		/** @type {Array<vscode.Location | vscode.LocationLink>} */
		const definitions = await within(
			vscode.commands.executeCommand(
				'vscode.executeDefinitionProvider',
				uri,
				document.positionAt(text.indexOf('useState(0)') + 2),
			),
			10000,
			[],
		);
		result.definitions = (definitions ?? []).map((definition) =>
			('targetUri' in definition ? definition.targetUri : definition.uri).path
				.split('/node_modules/')
				.pop(),
		);

		// A type error in the unsaved buffer only.
		const edit = new vscode.WorkspaceEdit();
		edit.insert(
			uri,
			document.positionAt(text.indexOf('\n\n\t<button')),
			'\n\tconst wrong: string = count;',
		);
		await vscode.workspace.applyEdit(edit);
		/** @type {vscode.Diagnostic[]} */
		let diagnostics = [];
		const diagnostic_deadline = Date.now() + config.diagnosticTimeoutMs;
		while (
			!diagnostics.some((diagnostic) => /not assignable/.test(diagnostic.message)) &&
			Date.now() < diagnostic_deadline
		) {
			await sleep(1000);
			diagnostics = vscode.languages.getDiagnostics(uri);
		}
		result.diagnostics = diagnostics.map((diagnostic) => ({
			source: diagnostic.source,
			code:
				typeof diagnostic.code === 'object'
					? String(diagnostic.code.value)
					: String(diagnostic.code),
			message: diagnostic.message,
		}));

		// Closing tags: type `<b` and then `>` inside the button, as a user would,
		// and record what follows: `<b></b>` once, nothing, or a closing tag
		// inserted by more than one provider.
		// Another extension may have opened an editor of its own meanwhile.
		const editor = await vscode.window.showTextDocument(document);
		result.activeEditorBeforeTyping = vscode.window.activeTextEditor?.document.uri.path
			.split('/')
			.pop();
		if (editor) {
			const before_close = document.positionAt(document.getText().indexOf('</button>'));
			editor.selection = new vscode.Selection(before_close, before_close);
			await vscode.commands.executeCommand('type', { text: '<b' });
			await vscode.commands.executeCommand('type', { text: '>' });
			await sleep(config.autoInsertWaitMs);
			const line = document.lineAt(before_close.line).text;
			const typed = line.indexOf('<b', line.indexOf('{count}'));
			result.closingTag = line.slice(typed, line.lastIndexOf('</button>'));
		}

		/** @param {string} id */
		const active = (id) => vscode.extensions.getExtension(id)?.isActive ?? 'not installed';
		result.extensions = {
			tsrx: active('tsrx.tsrx-vscode-plugin'),
			builtinTypeScript: active('vscode.typescript-language-features'),
			typescript7: active('TypeScriptTeam.native-preview'),
			typescript7Nightly: active('TypeScriptTeam.vscode-typescript-nightly'),
		};
		result.useTsgoAtEnd = use_tsgo('experimental.useTsgo');
		await within(
			vscode.commands.executeCommand('workbench.action.revertAndCloseActiveEditor'),
			5000,
			undefined,
		);
	} catch (error) {
		result.error = error instanceof Error ? error.stack : String(error);
	}
	fs.writeFileSync(config.out, JSON.stringify(result, null, 2));
};
