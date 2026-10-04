/** @import * as AST from 'estree' */

import { describe, expect, it } from 'vitest';
import { parseModule } from '../../src/index.js';

/**
 * @typedef {{ type?: string, start?: number, end?: number,
 * loc?: { start: { line: number, column: number }, end: { line: number, column: number } },
 * raw?: string, value?: unknown, name?: string, content?: string, css?: string,
 * children?: TestNode[], innerComments?: TestNode[] }} TestNode
 */

const LINE_BREAKS = [
	['LF', '\n'],
	['CR', '\r'],
	['CRLF', '\r\n'],
	['U+2028', '\u2028'],
	['U+2029', '\u2029'],
];

/**
 * The line and column of `offset`, counted in UTF-16 code units without the
 * parser. CRLF is one line break.
 * @param {string} source
 * @param {number} offset
 */
function position(source, offset) {
	let line = 1;
	let start = 0;
	for (let i = 0; i < offset; i++) {
		const ch = source.charCodeAt(i);
		if (ch === 13 && source.charCodeAt(i + 1) === 10) i++;
		else if (ch !== 10 && ch !== 13 && ch !== 0x2028 && ch !== 0x2029) continue;
		line++;
		start = i + 1;
	}
	return { line, column: offset - start };
}

/**
 * @param {unknown} value
 * @param {TestNode[]} result
 * @returns {TestNode[]}
 */
function nodes(value, result = []) {
	if (!value || typeof value !== 'object') return result;
	// CSS offsets are body-relative, unlike ESTree offsets.
	const node = /** @type {TestNode} */ (value);
	if (node.type === 'StyleSheet') return result;
	if (typeof node.type === 'string') result.push(node);
	for (const [key, child] of Object.entries(value)) {
		if (key !== 'loc' && key !== 'metadata') nodes(child, result);
	}
	return result;
}

/**
 * Expect the line and column of every located node in `value` to match its
 * offsets.
 * @param {string} source
 * @param {unknown} value
 */
function expectLocations(source, value) {
	/** @type {Array<[string | undefined, { line: number, column: number }, { line: number, column: number }]>} */
	const actual = [];
	/** @type {typeof actual} */
	const expected = [];
	for (const node of nodes(value)) {
		if (!node.loc || typeof node.start !== 'number' || typeof node.end !== 'number') continue;
		const { start, end } = node.loc;
		actual.push([
			node.type,
			{ line: start.line, column: start.column },
			{ line: end.line, column: end.column },
		]);
		expected.push([node.type, position(source, node.start), position(source, node.end)]);
	}
	expect(actual).toEqual(expected);
}

describe('template locations across line terminators', () => {
	describe.each(LINE_BREAKS)('with %s', (_name, newline) => {
		it.each(['', 'hello🚀', '<b/>'])(
			'ends a template line comment and keeps the markup after it, after %j',
			(prefix) => {
				const source =
					'function F() @{ <div>' + prefix + newline + '// note🚀' + newline + '<span/></div> }';
				/** @type {AST.CommentWithLocation[]} */
				const recorded = [];
				const program = parseModule(source, 'App.tsrx', { collect: true, comments: recorded });
				expectLocations(source, program);
				expectLocations(source, recorded);
				expect(recorded).toHaveLength(1);
				expect(recorded[0].value).toBe(' note🚀');
				expect(source.slice(recorded[0].start, recorded[0].end)).toBe('// note🚀');
				const all = nodes(program);
				expect(all.filter((n) => n.type === 'JSXIdentifier' && n.name === 'span')).toHaveLength(1);
				for (const comment of all.flatMap((n) => n.innerComments || [])) {
					expect(comment.value).toBe(' note🚀');
					expect(source.slice(comment.start, comment.end)).toBe('// note🚀');
				}
			},
		);

		it.each([false, true])(
			'keeps UTF-16 locations for JSXText and the tokens after it (template: %s)',
			(template) => {
				const first = 'a🚀' + newline + 'b';
				const second = 'c' + newline + 'd🚀';
				const element = '<div>' + first + '<span/>' + second + '</div>';
				const source = template
					? 'function F() @{ ' + element + ' }'
					: 'const view = ' + element + ';';
				const program = parseModule(source, 'App.tsrx');
				expectLocations(source, program);
				const texts = nodes(program).filter((n) => n.type === 'JSXText');
				expect(texts.map((n) => n.raw)).toEqual([first, second]);
				expect(texts.map((n) => n.value)).toEqual(
					[first, second].map((value) => value.replace(/\r\n/g, '\n')),
				);
				for (const text of texts) {
					expect(source.slice(text.start, text.end)).toBe(text.raw);
				}
			},
		);

		it.each([
			['style', false],
			['style', true],
			['script', false],
			['script', true],
		])('keeps the locations and authored text of raw <%s> content (closed: %s)', (tag, closed) => {
			const content =
				tag === 'style'
					? '/*🚀' + newline + 'x*/' + newline + '.a { color: red }'
					: '🚀' + newline + 'x' + newline + 'y';
			const source =
				'const view = <' + tag + '>' + content + (closed ? '</' + tag + '>; const after = 1;' : '');
			const program = parseModule(
				source,
				'App.tsrx',
				closed ? undefined : { loose: true, errors: [] },
			);
			expectLocations(source, program);
			const raw = nodes(program).find((n) =>
				tag === 'style'
					? n.type === 'JSXStyleElement'
					: n.type === 'JSXElement' && n.content !== undefined,
			);
			expect(raw).toBeDefined();
			expect(tag === 'style' ? raw?.css : raw?.content).toBe(content);
			// A `<script>` element has no children: `content` is its only body.
			expect(raw?.children?.map((child) => child.type)).toEqual(
				tag === 'style' ? ['StyleSheet'] : [],
			);
		});
	});

	it.each(['\u2028', '\u2029'])('keeps %j in JSX text as text', (newline) => {
		const source = 'const view = <div>' + newline + '</div>;';
		const program = parseModule(source, 'App.tsrx');
		const text = nodes(program).find((n) => n.type === 'JSXText');
		expect(text).toBeDefined();
		expect(text?.raw).toBe(newline);
		expect(text?.value).toBe(newline);
		expectLocations(source, program);
	});
});
