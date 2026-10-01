/**
 * The editor setups `run.js` checks, one isolated VS Code instance each.
 *
 * `expect` names what serves the fixture's `.tsrx` file:
 * - `typescript-7`: the TypeScript 7 extension (`tsc --lsp`) through
 *   `@tsrx/content-mapper` (diagnostic source `ts`).
 * - `vscode-typescript`: VS Code's own TypeScript (the tsserver it bundles, 5.x
 *   or 6.x) through `@tsrx/typescript-plugin` (diagnostic source `ts-plugin`).
 * - `nothing`: no TypeScript features at all. Such a scenario records a gap
 *   and says why in `gap`.
 *
 * `extensions` are installed into the instance's own extensions directory:
 * `tsrx` is the VSIX under test, `ts7` the marketplace TypeScript 7 extension
 * (`TypeScriptTeam.native-preview`), `ts7-nightly` its TypeScript 7 Nightly
 * companion (`TypeScriptTeam.vscode-typescript-nightly`, a 7.1 nightly
 * compiler). `settings` are that instance's user settings; `${project}` is the
 * fixture copy's path. `projectTypeScript` links the repository's TypeScript
 * 7.1 nightly into the fixture's `node_modules`.
 *
 * @typedef {'typescript-7' | 'vscode-typescript' | 'nothing'} Server
 * @typedef {{
 * 	name: string,
 * 	description: string,
 * 	extensions: Array<'tsrx' | 'ts7' | 'ts7-nightly'>,
 * 	settings?: Record<string, unknown>,
 * 	projectTypeScript?: boolean,
 * 	expect: Server,
 * 	gap?: string,
 * 	closingTag?: string,
 * 	check?: (result: Record<string, any>) => string | undefined,
 * }} Scenario
 */

/** @type {Scenario[]} */
export const SCENARIOS = [
	{
		name: 'ts7-project-nightly',
		description:
			"TypeScript 7 extension on (`useTsgo`), pointed at the project's TypeScript 7.1 nightly with `js/ts.tsdk.path`",
		extensions: ['tsrx', 'ts7'],
		settings: {
			'js/ts.experimental.useTsgo': true,
			'js/ts.tsdk.path': '${project}/node_modules/typescript',
		},
		projectTypeScript: true,
		expect: 'typescript-7',
		closingTag: '<b></b>',
	},
	{
		name: 'ts7-nightly-extension',
		description: 'TypeScript 7 extension on, compiler from the TypeScript 7 Nightly extension',
		extensions: ['tsrx', 'ts7', 'ts7-nightly'],
		settings: { 'js/ts.experimental.useTsgo': true },
		expect: 'typescript-7',
		closingTag: '<b></b>',
	},
	{
		name: 'ts7-nightly-extension-tsrx-closing-off',
		description:
			"TypeScript 7 extension on with the Nightly compiler, TSRX's own closing tags off: what TypeScript 7 closes by itself",
		extensions: ['tsrx', 'ts7', 'ts7-nightly'],
		settings: { 'js/ts.experimental.useTsgo': true, 'tsrx.autoClosingTags.enabled': false },
		expect: 'typescript-7',
		closingTag: '<b>',
		gap: 'The TypeScript 7 extension does not close tags in `.tsrx` files (microsoft/TypeScript#64564): the closing tag comes from the TSRX extension (`tsrx.autoClosingTags.enabled`).',
	},
	{
		name: 'ts7-bundled',
		description: 'TypeScript 7 extension on with its bundled compiler',
		extensions: ['tsrx', 'ts7'],
		settings: { 'js/ts.experimental.useTsgo': true },
		projectTypeScript: true,
		expect: 'nothing',
		closingTag: '<b></b>',
		gap: "The TypeScript 7 extension's bundled compiler is the stable 7.0 line, which has no content-mapper protocol, and VS Code's own TypeScript stands down while TypeScript 7 is on. The project's 7.1 nightly is not used: the extension only discovers `node_modules/@typescript/native-preview`, not `node_modules/typescript`.",
	},
	{
		name: 'ts7-first-run',
		description: 'TypeScript 7 extension installed, no settings: its first start turns itself on',
		extensions: ['tsrx', 'ts7'],
		expect: 'nothing',
		closingTag: '<b></b>',
		gap: 'Same as ts7-bundled: on its first start the TypeScript 7 extension sets `js/ts.experimental.useTsgo` to true in the user settings.',
		check: (result) =>
			result.useTsgoAtEnd?.user === true
				? undefined
				: 'expected the TypeScript 7 extension to turn `js/ts.experimental.useTsgo` on in the user settings',
	},
	{
		name: 'ts7-off',
		description: 'TypeScript 7 extension installed but off (`useTsgo: false`)',
		extensions: ['tsrx', 'ts7'],
		settings: { 'js/ts.experimental.useTsgo': false },
		projectTypeScript: true,
		expect: 'vscode-typescript',
		closingTag: '<b></b>',
	},
	{
		name: 'vscode-typescript',
		description: 'TSRX extension only',
		extensions: ['tsrx'],
		expect: 'vscode-typescript',
		closingTag: '<b></b>',
	},
	{
		name: 'vscode-typescript-tsrx-closing-off',
		description:
			"TSRX extension only, TSRX's own closing tags off: VS Code's TypeScript closes the tag through the tsserver plugin",
		extensions: ['tsrx'],
		settings: { 'tsrx.autoClosingTags.enabled': false },
		expect: 'vscode-typescript',
		closingTag: '<b></b>',
	},
	{
		name: 'vscode-typescript-closing-off',
		description:
			"TSRX extension only, VS Code's TypeScript closing tags off: TSRX closes tags only for TypeScript 7, so nothing closes it",
		extensions: ['tsrx'],
		settings: { 'js/ts.autoClosingTags.enabled': false },
		expect: 'vscode-typescript',
		closingTag: '<b>',
	},
	{
		name: 'vscode-typescript-project-ts7',
		description:
			'TSRX extension only, project has the TypeScript 7.1 nightly: VS Code cannot run it, so its bundled TypeScript serves',
		extensions: ['tsrx'],
		projectTypeScript: true,
		expect: 'vscode-typescript',
		closingTag: '<b></b>',
	},
];
