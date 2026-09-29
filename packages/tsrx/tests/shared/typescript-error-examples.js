/** @import { Diagnostic, DiagnosticWithValues, UpstreamError } from '../../src/diagnostics.js' */

import { TS_ERRORS, UPSTREAM_ERRORS } from '../../src/diagnostics.js';

/**
 * A source that makes the parser report one error with a TypeScript code, and
 * nothing else, in a collecting parse (the language server's and TypeScript
 * 7's content mapper's).
 * @typedef {object} TypeScriptErrorExample
 * @property {Diagnostic | DiagnosticWithValues | UpstreamError} error Its entry in `TS_ERRORS` or `UPSTREAM_ERRORS`
 * @property {string[]} [values] The values in its message, for an entry that takes them
 * @property {string} source TypeScript, and TSX, so that TypeScript can check it too
 * @property {boolean} collected Whether a collecting parse records the error and goes on, or throws it
 */

/**
 * An example of each error with a TypeScript code that TSRX reports, so tools
 * can compare TSRX's errors with TypeScript's on the same source: for one,
 * which of them TypeScript holds back while a file has a syntax error.
 * `typescript-error-examples.test.js` checks each against the parser, and that
 * every such error has one or is in {@link WITHOUT_EXAMPLE}.
 * @type {TypeScriptErrorExample[]}
 */
export const TYPESCRIPT_ERROR_EXAMPLES = [
	{ error: TS_ERRORS.TOKEN_EXPECTED, values: ['}'], source: 'if (a) {', collected: false },
	{ error: TS_ERRORS.IDENTIFIER_EXPECTED, source: 'export declare type = 1;', collected: false },
	{
		error: TS_ERRORS.RESERVED_WORD_AS_IDENTIFIER,
		values: ['default'],
		source: 'export type default class {}',
		collected: false,
	},
	{
		error: TS_ERRORS.IDENTIFIER_OR_STRING_EXPECTED,
		source: 'let x: import("m", { with: { [a]: 1 } });',
		collected: false,
	},
	{ error: TS_ERRORS.DECLARATION_EXPECTED, source: 'static static class A {}', collected: false },
	{
		error: TS_ERRORS.DECLARATION_OR_STATEMENT_EXPECTED,
		source: 'export type const x = 1;',
		collected: false,
	},
	{
		error: TS_ERRORS.LINE_BREAK_NOT_PERMITTED,
		source: `export declare type
Foo = 1;`,
		collected: false,
	},
	{
		error: TS_ERRORS.KEYWORD_ESCAPE,
		source: 'export \\u0061bstract function f() {}',
		collected: false,
	},
	{
		error: TS_ERRORS.PRIVATE_IDENTIFIER_OUTSIDE_CLASS,
		source: 'const x = this.#y;',
		collected: true,
	},
	{
		error: TS_ERRORS.MODIFIER_ALREADY_SEEN,
		values: ['declare'],
		source: 'declare declare class A {}',
		collected: true,
	},
	{
		error: TS_ERRORS.MODIFIER_MUST_PRECEDE,
		values: ['public', 'static'],
		source: `class A {
	static public a = 1;
}`,
		collected: true,
	},
	{
		error: TS_ERRORS.MODIFIER_CANNOT_BE_USED_WITH,
		values: ['static', 'abstract'],
		source: `abstract class A {
	static abstract x: number;
}`,
		collected: true,
	},
	{
		error: TS_ERRORS.MODIFIER_IN_AMBIENT_CONTEXT,
		values: ['async'],
		source: 'declare async function f(): void;',
		collected: true,
	},
	{
		error: TS_ERRORS.MODIFIER_CANNOT_BE_USED_HERE,
		values: ['async'],
		source: 'async class A {}',
		collected: true,
	},
	{
		error: TS_ERRORS.MODIFIER_ON_MODULE_ELEMENT,
		values: ['public'],
		source: 'public const a = 1;',
		collected: true,
	},
	{
		error: TS_ERRORS.MODIFIER_ON_USING,
		values: ['declare'],
		source: 'declare using x = y;',
		collected: true,
	},
	{
		error: TS_ERRORS.MODIFIER_ON_AWAIT_USING,
		values: ['declare'],
		source: 'declare await using x = y;',
		collected: true,
	},
	{
		error: TS_ERRORS.MODIFIERS_CANNOT_APPEAR_HERE,
		source: `function f() {
	export const a = 1;
}`,
		collected: true,
	},
	{
		error: TS_ERRORS.ACCESSIBILITY_MODIFIER_ALREADY_SEEN,
		source: `class A {
	public private a = 1;
}`,
		collected: true,
	},
	{
		error: TS_ERRORS.READONLY_MODIFIER_NOT_ALLOWED,
		source: 'readonly function f() {}',
		collected: true,
	},
	{
		error: TS_ERRORS.ACCESSOR_MODIFIER_NOT_ALLOWED,
		source: 'accessor class A {}',
		collected: true,
	},
	{
		error: TS_ERRORS.ABSTRACT_MODIFIER_NOT_ALLOWED,
		source: 'abstract function f() {}',
		collected: true,
	},
	{
		error: TS_ERRORS.MODIFIER_ON_IMPORT,
		values: ['declare'],
		source: 'declare import a from "a";',
		collected: true,
	},
	{
		error: TS_ERRORS.EXPORT_MODIFIER_ON_AUGMENTATION,
		source: 'export declare global {}',
		collected: true,
	},
	{ error: TS_ERRORS.READONLY_TYPE_MODIFIER, source: 'type A = readonly string;', collected: true },
	{
		error: TS_ERRORS.NESTED_IMPORT,
		source: `function f() {
	import a from "a";
}`,
		collected: true,
	},
	{
		error: TS_ERRORS.NESTED_EXPORT,
		source: `function f() {
	export { f };
}`,
		collected: true,
	},
	{
		error: TS_ERRORS.NESTED_EXPORT_ASSIGNMENT,
		source: `function f() {
	export = f;
}`,
		collected: true,
	},
	{
		error: TS_ERRORS.NESTED_DEFAULT_EXPORT,
		source: `function f() {
	export default 1;
}`,
		collected: true,
	},
	{
		error: TS_ERRORS.NESTED_NAMESPACE,
		source: `function f() {
	export declare namespace N {}
}`,
		collected: true,
	},
	{
		error: TS_ERRORS.NESTED_GLOBAL_EXPORT,
		source: `function f() {
	export as namespace A;
}`,
		collected: true,
	},
	{
		error: TS_ERRORS.AWAIT_EXPRESSION_NOT_ALLOWED,
		source: `namespace N {
	await 1;
}`,
		collected: true,
	},
	{
		error: TS_ERRORS.FOR_AWAIT_NOT_ALLOWED,
		source: `namespace N {
	for await (const a of []) {}
}`,
		collected: true,
	},
	{
		error: TS_ERRORS.AWAIT_USING_NOT_ALLOWED,
		source: `namespace N {
	await using a = b;
}`,
		collected: true,
	},
	{ error: TS_ERRORS.IMPORT_DEFER_NAMESPACE, source: 'import defer a from "a";', collected: false },
	{ error: TS_ERRORS.VARIABLE_DECLARATION_LIST_EMPTY, source: 'const;', collected: true },
	{
		error: TS_ERRORS.DECLARATION_NOT_INITIALIZED,
		values: ['const'],
		source: 'const x: number;',
		collected: true,
	},
	{ error: TS_ERRORS.FOR_IN_USING, source: 'for (using a in b) {}', collected: false },
	{ error: TS_ERRORS.FOR_IN_AWAIT_USING, source: 'for (await using a in b) {}', collected: false },
	{
		error: TS_ERRORS.BLOCK_SCOPED_VARIABLE_REDECLARED,
		values: ['a'],
		source: `let a = 1;
let a = 2;`,
		collected: true,
	},
	{
		error: TS_ERRORS.OUTER_SCOPED_VARIABLE_INITIALIZED,
		values: ['a', 'a'],
		source: `{
	let a;
	var a;
}`,
		collected: true,
	},
	{
		error: TS_ERRORS.CATCH_PARAMETER_REDECLARED,
		values: ['e'],
		source: `try {
} catch (e) {
	let e;
}`,
		collected: true,
	},
	{
		error: TS_ERRORS.ENUM_REDECLARED,
		source: `enum E {}
let E;`,
		collected: true,
	},
	{
		error: TS_ERRORS.SIGNATURE_PARAMETER_INITIALIZER,
		source: 'type F = (a = 1) => void;',
		collected: true,
	},
	{
		error: TS_ERRORS.PATTERN_PARAMETER_PROPERTY,
		source: `class A {
	constructor(private { a }) {}
}`,
		collected: true,
	},
	{
		error: TS_ERRORS.REST_PARAMETER_PROPERTY,
		source: `class A {
	constructor(private ...a) {}
}`,
		collected: true,
	},
	{
		error: TS_ERRORS.PARAMETER_PROPERTY_OUTSIDE_CONSTRUCTOR,
		source: 'function f(private a) {}',
		collected: true,
	},
	{
		error: TS_ERRORS.REST_PARAMETER_INITIALIZER,
		source: 'function f(...a = []) {}',
		collected: true,
	},
	{
		error: TS_ERRORS.REST_ELEMENT_INITIALIZER,
		source: 'const [...a = [1]] = [1];',
		collected: true,
	},
	{ error: TS_ERRORS.OPTIONAL_REST_PARAMETER, source: 'function f(...a?) {}', collected: true },
	{
		error: TS_ERRORS.OPTIONAL_BINDING_PATTERN_PARAMETER,
		source: 'function f({ a }?) {}',
		collected: true,
	},
	{ error: TS_ERRORS.UNEXPECTED_TOKEN, source: 'let x = );', collected: false },
	{ error: TS_ERRORS.REST_ELEMENT_TRAILING_COMMA, source: 'const [...a,] = [1];', collected: true },
	{ error: TS_ERRORS.ARGUMENT_NAME_CLASH, source: 'function f(a, a) {}', collected: true },
	{
		error: TS_ERRORS.KEYWORD_ESCAPE_SEQUENCE,
		values: ['import'],
		source: 'const m = \\u0069mport.defer("a");',
		collected: false,
	},
	{
		error: TS_ERRORS.AWAIT_USING_OUTSIDE_ASYNC,
		source: `function f() {
	await using a = b;
}`,
		collected: false,
	},
	{ error: TS_ERRORS.FOR_OF_LET, source: 'for (let.a of b) {}', collected: false },
	{ error: TS_ERRORS.FOR_IN_INITIALIZER, source: 'for (var a = 1 in b) {}', collected: false },
	{ error: TS_ERRORS.FOR_OF_INITIALIZER, source: 'for (let a = 1 of b) {}', collected: false },
	{ error: TS_ERRORS.MISSING_CATCH_OR_FINALLY, source: 'try {}', collected: false },
	{
		error: TS_ERRORS.MULTIPLE_DEFAULT_CLAUSES,
		source: `switch (a) {
	default:
	default:
}`,
		collected: false,
	},
	{ error: TS_ERRORS.JSX_ATTRIBUTE_VALUE, source: 'const a = <div a=1 />;', collected: false },
	{
		error: TS_ERRORS.ONLY_STRING_ATTRIBUTE_VALUE,
		source: 'import a from "a" with { type: 1 };',
		collected: false,
	},
	{ error: TS_ERRORS.TYPE_IMPORT_ARGUMENT, source: 'type A = import(a);', collected: false },
	{
		error: TS_ERRORS.UNEXPECTED_LEADING_DECORATOR,
		source: '@dec function f() {}',
		collected: true,
	},
	{
		error: TS_ERRORS.TYPE_CAST_IN_PARAMETER,
		source: 'const f = (x as number) => x;',
		collected: false,
	},
	{ error: TS_ERRORS.UNEXPECTED_TYPE_ANNOTATION, source: 'f(a: number);', collected: false },
	{
		error: TS_ERRORS.RESERVED_ARROW_TYPE_PARAMETER,
		source: 'const f = <T>() => 1;',
		collected: true,
	},
	{
		error: UPSTREAM_ERRORS.REDECLARED,
		source: `var a = 1;
let a = 2;`,
		collected: true,
	},
	{ error: UPSTREAM_ERRORS.EXPORT_NOT_DEFINED, source: 'export { missing };', collected: true },
	{ error: UPSTREAM_ERRORS.OPTIONAL_CHAIN_ASSIGNMENT, source: 'a?.b = 1;', collected: true },
	{ error: UPSTREAM_ERRORS.IMPORT_META_PROPERTY, source: 'import.source("a");', collected: true },
	{ error: UPSTREAM_ERRORS.NEW_TARGET_OUTSIDE_FUNCTION, source: 'new.target;', collected: true },
	{
		error: UPSTREAM_ERRORS.SUPER_OUTSIDE_METHOD,
		source: `function f() {
	super.x;
}`,
		collected: true,
	},
	{
		error: UPSTREAM_ERRORS.SUPER_CALL_OUTSIDE_CONSTRUCTOR,
		source: `class A {
	m() {
		super();
	}
}`,
		collected: true,
	},
	{ error: UPSTREAM_ERRORS.LET_RESERVED, source: 'const let = 1;', collected: true },
	{
		error: UPSTREAM_ERRORS.ABSTRACT_METHOD_IN_CLASS,
		source: `class A {
	abstract m(): void;
}`,
		collected: true,
	},
	{
		error: UPSTREAM_ERRORS.AMBIENT_INITIALIZER,
		source: 'declare let a: number = 1;',
		collected: true,
	},
	{
		error: UPSTREAM_ERRORS.DUPLICATE_MODIFIER,
		source: `class A {
	readonly readonly a = 1;
}`,
		collected: true,
	},
	{
		error: UPSTREAM_ERRORS.TYPE_MEMBER_MODIFIER,
		source: `interface A {
	public a: number;
}`,
		collected: true,
	},
	{
		error: UPSTREAM_ERRORS.TYPE_PARAMETER_MODIFIER,
		source: 'interface I<public T> {}',
		collected: true,
	},
	{ error: UPSTREAM_ERRORS.VARIANCE_MODIFIER, source: 'function f<in T>() {}', collected: true },
	{
		error: UPSTREAM_ERRORS.PRIVATE_ELEMENT_ACCESSIBILITY,
		source: `class A {
	public #a = 1;
}`,
		collected: true,
	},
	{
		error: UPSTREAM_ERRORS.PRIVATE_ELEMENT_ABSTRACT,
		source: `abstract class A {
	abstract #a: number;
}`,
		collected: true,
	},
	{
		error: UPSTREAM_ERRORS.DECORATED_CONSTRUCTOR,
		source: `class A {
	@dec constructor() {}
}`,
		collected: true,
	},
];

/**
 * The errors with a TypeScript code that no source makes the parser report on
 * their own, and why.
 * @type {Map<Diagnostic | DiagnosticWithValues | UpstreamError, string>}
 */
export const WITHOUT_EXAMPLE = new Map(
	/** @type {Array<[Diagnostic | DiagnosticWithValues | UpstreamError, string]>} */ ([
		[
			TS_ERRORS.DECLARE_MODIFIER_IN_AMBIENT_CONTEXT,
			'Only beside another modifier error: `declare public class A {}` in an ambient namespace also gives TS1044, and `declare class A {}` there gives none (#961).',
		],
		[
			TS_ERRORS.DECLARED_IN_SCOPE,
			'No source found: the parser rejects a name declared twice in one scope first (TS2300, TS2451) (#964).',
		],
		[
			TS_ERRORS.SIGNATURE_PARAMETER_NAME,
			'No source found: a parameter property in a signature is TS2369 first (#964).',
		],
		[
			TS_ERRORS.UNTERMINATED_JSX_CONTENTS,
			"No source found: the end of the input in JSX text is the unclosed element (TSRX1001), or its template's `'}' expected.` (TS1005), first (#964).",
		],
		[
			TS_ERRORS.JSX_UNESCAPED_GREATER_THAN,
			'No source found: a `>` in JSX text is text (#711) (#964).',
		],
		[
			TS_ERRORS.JSX_UNESCAPED_CLOSING_BRACE,
			'No source found: a `}` in JSX text is `Unexpected token` (TS1012) and the unclosed element (TSRX1001) first (#964).',
		],
		[
			UPSTREAM_ERRORS.LET_BINDING,
			"`let` as a name is `The keyword 'let' is reserved` (TS1212) at the same place first, and the parser reports one error there (#962).",
		],
	]),
);
