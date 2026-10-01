import { createProxyLanguageService } from '@volar/typescript/lib/node/proxyLanguageService.js';
import {
	createLanguageCommon,
	isHasAlreadyDecoratedLanguageService,
	makeGetExternalFiles,
	projectExternalFileExtensions,
} from '@volar/typescript/lib/quickstart/languageServicePluginCommon.js';
import { getTsrxLanguagePlugin } from './language.js';
import { without_typescript_diagnostics_on_compile_error } from './plugin-diagnostics.js';
import { with_jsx_closing_tags } from './plugin-jsx-closing-tag.js';

/**
 * The Volar language each decorated language service maps through, for the
 * methods Volar's own proxy leaves out (`with_jsx_closing_tags`).
 * @type {WeakMap<object, import('@volar/language-core').Language<string>>}
 */
const languages = new WeakMap();

/**
 * TypeScript's tsserver loads this plugin to serve `.tsrx` files: through the
 * `plugins` entry of a project's tsconfig.json (other editors, next to the
 * workspace TypeScript), or handed to whichever tsserver VS Code runs by the
 * TSRX VS Code extension (`typescriptServerPlugins`), where the TSRX language
 * server runs beside it in its slim `plugin` mode and adds what a tsserver
 * plugin cannot: TSRX compile errors, snippets, CSS in `<style>`, symbols.
 *
 * `create` is Volar's `createLanguageServicePlugin` (quickstart), reproduced so
 * the Volar language it creates can be kept for `with_jsx_closing_tags`.
 * @param {{ typescript: typeof import('typescript') }} modules
 */
const plugin = (modules) => {
	const { typescript: ts } = modules;
	return {
		/** @param {import('typescript').server.PluginCreateInfo} info */
		create(info) {
			if (!isHasAlreadyDecoratedLanguageService(info)) {
				const created = {
					languagePlugins: [
						getTsrxLanguagePlugin({
							ts,
							configFileName:
								info.project.projectKind === ts.server.ProjectKind.Configured
									? info.project.getProjectName()
									: undefined,
							configHost: ts.sys,
						}),
					],
				};
				projectExternalFileExtensions.set(
					info.project,
					created.languagePlugins.flatMap(
						(language_plugin) =>
							language_plugin.typescript?.extraFileExtensions.map(
								(extension) => '.' + extension.extension,
							) ?? [],
					),
				);
				const { proxy, initialize } = createProxyLanguageService(info.languageService);
				info.languageService = proxy;
				createLanguageCommon(created, ts, info, (language) => {
					languages.set(proxy, language);
					initialize(language);
				});
			}
			const decorated = info.languageService;
			return with_jsx_closing_tags(without_typescript_diagnostics_on_compile_error(decorated), () =>
				languages.get(decorated),
			);
		},
		getExternalFiles: makeGetExternalFiles(ts),
	};
};

export default plugin;
