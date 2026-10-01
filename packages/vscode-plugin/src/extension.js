/**
 * VS Code's selected TypeScript owns TypeScript features for `.tsrx` files:
 * - On TypeScript 5.9/6, the built-in extension runs the contributed
 *   `@tsrx/typescript-plugin` and manages `.tsrx` documents itself.
 * - On TypeScript 7, the native extension discovers configured projects through
 *   `registerContentMappers` and runs the mapper each tsconfig.json declares.
 *
 * The TSRX language server runs alongside it in `plugin` mode for snippets, CSS,
 * document symbols, CSS-class navigation and keyword highlights, and closes tags while
 * TypeScript 7 does not (`closing-tags.js`). A status item on `.tsrx` files names the
 * TypeScript that serves them, and a notice says what to do when none can
 * (`typescript-guidance.js`).
 * It also reports compile errors; `diagnostics.js` removes that copy once the native
 * mapper reports for the file, and removes each one tsserver reports itself. This
 * extension neither loads TypeScript nor patches another extension, and has no
 * TypeScript backend setting of its own.
 */

import vscode from 'vscode';
import path from 'node:path';
import fs from 'node:fs';
import protocol from '@volar/language-server/protocol';
import * as lsp from 'vscode-languageclient/node';
import { createLabsInfo } from '@volar/vscode';
import { activate_closing_tags } from './closing-tags.js';
import { CompileErrorDedupe } from './diagnostics.js';
import { activate_typescript } from './typescript.js';
import { activate_typescript_guidance } from './typescript-guidance.js';

const TSRX_FILE_SELECTORS = ['**/*.tsrx'];
const RESTART_EXTENSIONS_ACTION = 'Restart Extensions';

/**
 * @param {string} file_path
 * @returns {boolean}
 */
function is_tsrx_file_path(file_path) {
	return file_path.endsWith('.tsrx');
}

/**
 * Re-apply the compile-error filter to the language server's diagnostics for a file:
 * directly to the ones it last pushed, and by asking VS Code to pull them again for pulled ones.
 * @param {import('vscode').Uri} uri
 */
function refresh_server_diagnostics(uri) {
	if (!client) {
		return;
	}
	const received = dedupe.received.get(uri.toString());
	const pushed = received
		? received.pushed
			? received.diagnostics
			: undefined
		: client.diagnostics?.get(uri);
	if (pushed?.length) {
		client.diagnostics?.set(
			uri,
			/** @type {import('vscode').Diagnostic[]} */ (
				dedupe.filter(pushed, vscode.languages.getDiagnostics(uri))
			),
		);
		return;
	}
	const document = vscode.workspace.textDocuments.find(
		(candidate) => candidate.uri.toString() === uri.toString(),
	);
	if (document) {
		client
			.getFeature(lsp.DocumentDiagnosticRequest.method)
			?.getProvider(document)
			?.onDidChangeDiagnosticsEmitter.fire();
	}
}

/** @type {import('vscode-languageclient/node').LanguageClient | undefined} */
let client;
/**
 * Whether TypeScript 7's content mapper has been seen reporting in this session, and the
 * server's diagnostics for each file before filtering.
 */
const dedupe = new CompileErrorDedupe();

/**
 * @param {import('vscode').ExtensionContext} context
 */
export async function activate(context) {
	console.log('TSRX extension starting...');

	if (!vscode.workspace.isTrusted) {
		// `capabilities.untrustedWorkspaces.supported` is false in package.json, so VS Code does
		// not activate this extension in Restricted Mode; this is the defensive twin. The TSRX
		// compilers and the content mapper execute code from the workspace.
		console.warn('[TSRX] Workspace is not trusted; TSRX language features stay off.');
		return;
	}

	// Which TypeScript serves .tsrx files, and what to do when none can.
	const typescript_guidance = activate_typescript_guidance(context);

	const serverModule = path.join(__dirname, 'server.js');

	if (!fs.existsSync(serverModule)) {
		const message = `Server module not found at: ${serverModule}`;
		console.error(message);
		vscode.window.showErrorMessage(message);
		return;
	}

	const runOptions = {
		execArgv: [],
		env: {
			...process.env,
			TSRX_DEBUG: process.env.TSRX_DEBUG === 'false' ? 'false' : 'true',
		},
	};

	const debugOptions = {
		execArgv: ['--nolazy', '--inspect'],
		env: {
			...process.env,
			TSRX_DEBUG: process.env.TSRX_DEBUG === 'false' ? 'false' : 'true',
		},
	};

	const serverOptions = {
		run: {
			module: serverModule,
			transport: lsp.TransportKind.stdio,
			options: runOptions,
		},
		debug: {
			module: serverModule,
			transport: lsp.TransportKind.stdio,
			options: debugOptions,
		},
	};

	/** @type {import('vscode-languageclient/node').LanguageClientOptions} */
	const clientOptions = {
		documentSelector: [{ language: 'tsrx' }],
		// VS Code's own TypeScript serves every TypeScript feature for .tsrx files (its tsserver
		// through the contributed @tsrx/typescript-plugin, or TypeScript 7 through
		// @tsrx/content-mapper), so the server never loads TypeScript and never serves TypeScript
		// features here. It always reports TSRX compile errors; the middleware below drops that
		// copy once TypeScript 7's content mapper has been seen reporting in this session, so
		// the extension never has to know which TypeScript VS Code runs, and drops each one
		// tsserver shows itself (same TypeScript code, same place).
		initializationOptions: { typescriptBackend: 'plugin' },
		middleware: {
			handleDiagnostics(uri, diagnostics, next) {
				const all = vscode.languages.getDiagnostics(uri);
				next(uri, dedupe.receive(uri.toString(), diagnostics, all, true));
			},
			async provideDiagnostics(document, previousResultId, token, next) {
				const report = await next(document, previousResultId, token);
				if (report && 'items' in report) {
					const uri = document instanceof vscode.Uri ? document : document.uri;
					const all = vscode.languages.getDiagnostics(uri);
					report.items = dedupe.receive(uri.toString(), report.items, all, false);
				}
				return report;
			},
		},
		errorHandler: {
			error: (
				/** @type {Error} */ error,
				/** @type {import('vscode-languageclient/node').Message | undefined} */ message,
				/** @type {number | undefined} */ count,
			) => {
				console.error('Language server error:', error, message, count);
				return { action: lsp.ErrorAction.Continue };
			},
			closed: () => {
				console.log('Language server connection closed');
				return { action: lsp.CloseAction.Restart };
			},
		},
		outputChannel: vscode.window.createOutputChannel('TSRX Language Server'),
		traceOutputChannel: vscode.window.createOutputChannel('TSRX Language Server Trace'),
	};

	try {
		client = new lsp.LanguageClient('tsrx', 'TSRX Language Server', serverOptions, clientOptions);

		console.log('Starting language client...');
		await client.start();
		console.log('Language client started successfully');

		const volar_labs = createLabsInfo(protocol);
		volar_labs.addLanguageClient(client);

		activate_closing_tags(context, client);

		// Configure Prettier to handle .tsrx files. This sets Prettier as the default
		// formatter for `[tsrx]`, so "Format Document" routes to it directly. We deliberately
		// do not register our own DocumentFormattingEditProvider: it would show up as a second,
		// redundant "TSRX Syntax for VS Code" entry in "Format Document With…" alongside the one the
		// language client already contributes (volar-service-typescript / -css), and it broke
		// whenever the Prettier extension's format command was unavailable.
		await configurePrettier();

		// The menus in package.json reuse the built-in TypeScript extension's commands on .tsrx
		// files. VS Code manages .tsrx documents itself (the contributed plugin declares the
		// language) and maintains every context key those menus use, `typescript.isManagedFile`,
		// `tsSupportsFileReferences`, `supportedCodeAction`; with TypeScript 7 on, the built-in
		// extension is off and those entries stay hidden by themselves.

		// The mapper's compile errors, and tsserver's diagnostics, can arrive after the server's
		// copy is already shown, and tsserver's can go while the server's copy is hidden. On the
		// first sighting of the mapper, and whenever a .tsrx file shows other server compile
		// errors than the filter gives now, refresh the server's diagnostics so the middleware
		// filters them again.
		context.subscriptions.push(
			vscode.languages.onDidChangeDiagnostics((event) => {
				for (const uri of event.uris) {
					if (!is_tsrx_file_path(uri.fsPath)) {
						continue;
					}
					const all = vscode.languages.getDiagnostics(uri);
					if (dedupe.observe(all)) {
						for (const document of vscode.workspace.textDocuments) {
							if (document.languageId === 'tsrx') {
								refresh_server_diagnostics(document.uri);
							}
						}
					} else if (dedupe.needs_refresh(uri.toString(), all)) {
						refresh_server_diagnostics(uri);
					}
				}
			}),
			vscode.workspace.onDidCloseTextDocument((document) => {
				dedupe.received.delete(document.uri.toString());
			}),
		);

		await activate_typescript(context);

		addCustomCommands(context);
		console.log('[TSRX] Registered custom commands');

		console.log('[TSRX] Extension activated successfully');
		// `typescriptGuidance` is read by the editor tests (`editor-tests/harness`).
		return { ...volar_labs.extensionExports, typescriptGuidance: typescript_guidance };
	} catch (error) {
		console.error('Failed to start language client:', error);
		const message = error instanceof Error ? error.message : String(error);
		vscode.window.showErrorMessage(`Failed to start TSRX language server: ${message}`);
		return { typescriptGuidance: typescript_guidance };
	}
}

/**
 * The extension's own commands.
 * @param {import('vscode').ExtensionContext} context
 */
function addCustomCommands(context) {
	context.subscriptions.push(
		vscode.commands.registerCommand('tsrx.goToSourceDefinition', async () => {
			try {
				const editor = vscode.window.activeTextEditor;
				if (!editor) {
					console.log('[TSRX] No active editor');
					return;
				}

				const position = editor.selection.active;
				console.log('[TSRX] Getting definitions at position:', position);

				// Use VS Code's definition provider API
				const definitions = await vscode.commands.executeCommand(
					'vscode.executeDefinitionProvider',
					editor.document.uri,
					position,
				);

				console.log('[TSRX] Definitions result:', definitions);

				if (!definitions || !Array.isArray(definitions) || definitions.length === 0) {
					vscode.window.showInformationMessage('No definition found');
					return;
				}

				// Filter for .tsrx files (prefer source over .d.ts)
				// Definition objects can have either `uri` or `targetUri`
				const tsrxDefinition = definitions.find((d) => {
					const uri = d?.uri || d?.targetUri;
					if (!uri) {
						console.warn('[TSRX] Definition has no uri:', d);
						return false;
					}
					const is_tsrx = is_tsrx_file_path(uri.path);
					console.log('[TSRX] Checking definition:', uri.path, 'isTSRX:', is_tsrx);
					return is_tsrx;
				});

				if (tsrxDefinition) {
					const uri = tsrxDefinition.uri || tsrxDefinition.targetUri;
					const range = tsrxDefinition.range || tsrxDefinition.targetRange;
					console.log('[TSRX] Found tsrx definition:', uri.path);
					await vscode.window.showTextDocument(uri, {
						selection: range,
					});
				} else {
					// If no .tsrx file found, just go to the first definition (might be .d.ts)
					const firstDef = definitions[0];
					const uri = firstDef?.uri || firstDef?.targetUri;
					const range = firstDef?.range || firstDef?.targetRange;
					console.log('[TSRX] No .tsrx definition, using first result:', uri?.path);
					if (uri) {
						await vscode.window.showTextDocument(uri, {
							selection: range,
						});
					}
				}
			} catch (error) {
				console.error('[TSRX] Error in goToSourceDefinition:', error);
				const message = error instanceof Error ? error.message : String(error);
				vscode.window.showErrorMessage(`Go to Source Definition failed: ${message}`);
			}
		}),
	);
}

async function configurePrettier() {
	try {
		const config = vscode.workspace.getConfiguration();

		// Tell Prettier extension to enable formatting for tsrx language
		await config.update(
			'prettier.documentSelectors',
			TSRX_FILE_SELECTORS,
			vscode.ConfigurationTarget.Global,
		);

		// Set Prettier as default formatter for .tsrx files
		await config.update(
			'[tsrx]',
			{
				'editor.defaultFormatter': 'esbenp.prettier-vscode',
			},
			vscode.ConfigurationTarget.Global,
		);

		console.log('Prettier configuration updated for TSRX files');
	} catch (error) {
		console.error('Failed to configure Prettier:', error);
	}
}

export async function deactivate() {
	console.log('Deactivating TSRX extension...');
	if (client) {
		try {
			await client.stop();
			console.log('Language client stopped');
		} catch (error) {
			console.error('Error stopping language client:', error);
		}
	}
}
