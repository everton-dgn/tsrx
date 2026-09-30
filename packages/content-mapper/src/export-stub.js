/** @import * as AST from 'estree' */

/**
 * Build a TypeScript stub that preserves a module's export surface while the
 * file cannot be compiled.
 *
 * Raw TSRX, or the last good TSX (which may carry type errors of its own),
 * would give the checker noise to report. Instead every
 * export from the last successful transform's source AST is re-declared as
 * `any` (both as a value and as a type, so `new X()`, `X.y` and `let v: X` all
 * keep resolving), re-exports from other modules are kept as written (including
 * their `type` modifiers, so `isolatedModules` and `verbatimModuleSyntax` do
 * not reject the stub), and the compile error is reported through the mapper's
 * own diagnostics. Importers keep resolving; the author sees one error at the
 * right place.
 * @param {AST.Program | null | undefined} program The last successfully parsed source AST, if any.
 * @returns {string}
 */
export function build_export_stub(program) {
	/** @type {string[]} */
	const lines = [];
	/** @type {Set<string>} */
	const names = new Set();
	let has_default = false;

	for (const statement of program?.body ?? []) {
		switch (statement.type) {
			case 'ExportAllDeclaration': {
				const exported = statement.exported ? ` as ${print_name(statement.exported)}` : '';
				lines.push(
					`export ${type_modifier(statement)}*${exported} from ${JSON.stringify(String(statement.source.value))};`,
				);
				break;
			}
			case 'ExportDefaultDeclaration':
				has_default = true;
				break;
			case 'ExportNamedDeclaration': {
				if (statement.source) {
					const statement_is_type = type_modifier(statement) !== '';
					const specifiers = statement.specifiers.map((specifier) => {
						const local = print_name(specifier.local);
						const exported = print_name(specifier.exported);
						// `export type { A }` marks the statement; `export { type A }`
						// marks the specifier. Never write both.
						const modifier = statement_is_type ? '' : type_modifier(specifier);
						return `${modifier}${local === exported ? local : `${local} as ${exported}`}`;
					});
					lines.push(
						`export ${type_modifier(statement)}{ ${specifiers.join(', ')} } from ${JSON.stringify(String(statement.source.value))};`,
					);
					break;
				}
				for (const specifier of statement.specifiers) {
					const exported = export_name(specifier.exported);
					if (exported === 'default') has_default = true;
					else names.add(exported);
				}
				if (statement.declaration) {
					for (const name of declaration_names(statement.declaration)) {
						names.add(name);
					}
				}
				break;
			}
			default:
				break;
		}
	}

	// A name no declaration can have (`null`, `if`, `string` for a type, an
	// arbitrary module namespace name such as `"foo-bar"`) is exported from a
	// local binding of another name.
	let next_local = 0;
	for (const name of names) {
		if (identifier_pattern.test(name) && !UNDECLARABLE_NAMES.has(name)) {
			lines.push(`export declare const ${name}: any;`);
			lines.push(`export type ${name} = any;`);
			continue;
		}
		let local = `_$_export_${next_local++}`;
		while (names.has(local)) local = `_$_export_${next_local++}`;
		lines.push(`declare const ${local}: any;`);
		lines.push(`type ${local} = any;`);
		lines.push(`export { ${local} as ${module_export_name(name)} };`);
	}
	if (has_default) {
		lines.push('declare const _default: any;');
		lines.push('export default _default;');
	}
	if (lines.length === 0) {
		lines.push('export {};');
	}
	return lines.join('\n') + '\n';
}

/**
 * `type ` for a type-only export statement or specifier (the ESTree-TS
 * `exportKind` field), else the empty string.
 * @param {AST.Node} node
 * @returns {'type ' | ''}
 */
function type_modifier(node) {
	return /** @type {{ exportKind?: string }} */ (node).exportKind === 'type' ? 'type ' : '';
}

const identifier_pattern = /^[\p{ID_Start}_$][\p{ID_Continue}$]*$/u;

/**
 * Identifier names that `export declare const x: any; export type x = any;`
 * can't declare in a module: reserved words (TS1389), words reserved in strict
 * mode (TS1214), `await`, `let`, `arguments` and `eval`, the names of
 * TypeScript's own types (TS2457), and `as`, which `export type as` misreads.
 */
const UNDECLARABLE_NAMES = new Set([
	'break',
	'case',
	'catch',
	'class',
	'const',
	'continue',
	'debugger',
	'default',
	'delete',
	'do',
	'else',
	'enum',
	'export',
	'extends',
	'false',
	'finally',
	'for',
	'function',
	'if',
	'import',
	'in',
	'instanceof',
	'new',
	'null',
	'return',
	'super',
	'switch',
	'this',
	'throw',
	'true',
	'try',
	'typeof',
	'var',
	'void',
	'while',
	'with',
	'implements',
	'interface',
	'package',
	'private',
	'protected',
	'public',
	'static',
	'yield',
	'await',
	'let',
	'arguments',
	'eval',
	'any',
	'bigint',
	'boolean',
	'never',
	'number',
	'object',
	'string',
	'symbol',
	'undefined',
	'unknown',
	'as',
]);

/**
 * The name an export binds, as a plain string: `a` for `export { a }` and
 * `foo-bar` for `export { "foo-bar" as a } from`.
 * @param {AST.Identifier | AST.Literal | AST.Expression} node
 * @returns {string}
 */
function export_name(node) {
	if (node.type === 'Identifier') return node.name;
	if (node.type === 'Literal') return String(node.value);
	return '';
}

/**
 * The name as it must be written back in a re-export: an identifier as is, an
 * arbitrary module namespace name (`export { "foo-bar" as a } from`,
 * `export * as "ns-name" from`) quoted, so the stub stays valid TypeScript.
 * @param {AST.Identifier | AST.Literal | AST.Expression} node
 * @returns {string}
 */
function print_name(node) {
	return module_export_name(export_name(node));
}

/**
 * A name as an export specifier takes it: any identifier name, reserved words
 * too, as is, and anything else quoted.
 * @param {string} name
 * @returns {string}
 */
function module_export_name(name) {
	return identifier_pattern.test(name) ? name : JSON.stringify(name);
}

/**
 * @param {AST.Declaration | AST.Node} declaration
 * @returns {string[]}
 */
function declaration_names(declaration) {
	switch (declaration.type) {
		case 'VariableDeclaration':
			return declaration.declarations.flatMap((declarator) => pattern_names(declarator.id));
		case 'FunctionDeclaration':
		case 'ClassDeclaration':
			return declaration.id ? [declaration.id.name] : [];
		default: {
			// TypeScript declarations (interface, type alias, enum, module) all
			// carry an `id` identifier in the ESTree-TS shape.
			const id = /** @type {{ id?: AST.Node }} */ (declaration).id;
			return id && id.type === 'Identifier' ? [/** @type {AST.Identifier} */ (id).name] : [];
		}
	}
}

/**
 * @param {AST.Pattern} pattern
 * @returns {string[]}
 */
function pattern_names(pattern) {
	switch (pattern.type) {
		case 'Identifier':
			return [pattern.name];
		case 'ObjectPattern':
			return pattern.properties.flatMap((property) =>
				property.type === 'RestElement'
					? pattern_names(property.argument)
					: pattern_names(property.value),
			);
		case 'ArrayPattern':
			return pattern.elements.flatMap((element) => (element ? pattern_names(element) : []));
		case 'RestElement':
			return pattern_names(pattern.argument);
		case 'AssignmentPattern':
			return pattern_names(pattern.left);
		default:
			return [];
	}
}
