/**
 * Go to Source Definition for `.tsrx` files on TypeScript 5.9 and 6.
 *
 * VS Code's own command only runs in TypeScript and JavaScript files, and its
 * `typescript.tsserverRequest` command forwards only a few requests plus any
 * request whose name starts with `_`. So the TSRX extension sends
 * `SOURCE_DEFINITION_COMMAND`, which runs the session's own `findSourceDefinition`.
 *
 * To find the JavaScript behind a `.d.ts` file, `findSourceDefinition` adds the
 * requesting file to a helper project (an `AuxiliaryProject` with
 * `noDtsResolution`). tsserver loads no plugins into that project, so it would read
 * a `.tsrx` file as plain TypeScript, while the host project registered it as TSX:
 * the shared document registry then fails an assertion ("Script kind should match
 * provided ScriptKind"). `with_source_definition_project` gives the helper project
 * the host project's Volar setup before tsserver builds its program.
 */

export const SOURCE_DEFINITION_COMMAND = '_tsrx:findSourceDefinition';

/** @type {WeakSet<object>} */
const sessions = new WeakSet();

/**
 * Register `SOURCE_DEFINITION_COMMAND` once per session.
 * @param {import('typescript').server.Session | undefined} session
 */
export function register_source_definition_command(session) {
	const find_source_definition = /** @type {any} */ (session)?.findSourceDefinition;
	if (!session || sessions.has(session) || typeof find_source_definition !== 'function') return;
	sessions.add(session);
	try {
		session.addProtocolHandler(SOURCE_DEFINITION_COMMAND, (request) => ({
			response: find_source_definition.call(session, request.arguments),
			responseRequired: true,
		}));
	} catch {
		// Another copy of this plugin (a tsconfig `plugins` entry beside VS Code's
		// global plugin) registered it first.
	}
}

/**
 * Run `decorate` on the helper project `findSourceDefinition` creates for
 * `project`, once, before its program is built.
 * @param {import('typescript').server.Project} project
 * @param {(helper: import('typescript').server.Project) => void} decorate
 */
export function with_source_definition_project(project, decorate) {
	const host = /** @type {any} */ (project);
	const get_project = host.getNoDtsResolutionProject;
	if (typeof get_project !== 'function') return;
	/** @type {WeakSet<object>} */
	const decorated = new WeakSet();
	host.getNoDtsResolutionProject = function (/** @type {string} */ root_file) {
		const helper = get_project.call(this, root_file);
		if (!decorated.has(helper)) {
			decorated.add(helper);
			decorate(helper);
		}
		return helper;
	};
}
