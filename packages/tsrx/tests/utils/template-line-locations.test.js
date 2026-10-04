import assert from 'node:assert/strict';
import { test } from 'vitest';
import { parseModule } from '../../src/index.js';

/**
 * @typedef {{ type?: string, start?: number, end?: number,
 * loc?: { start: { line: number, column: number }, end: { line: number, column: number } },
 * raw?: string, value?: unknown, name?: string, content?: string, css?: string,
 * children?: TestNode[], innerComments?: TestNode[] }} TestNode
 */

/** @param {string} source @param {number} offset */
// Scan UTF-16 code units independently of the parser. CRLF is one line break.
function position(source, offset) {
	let line = 1,
		start = 0;
	for (let i = 0; i < offset; i++) {
		const ch = source.charCodeAt(i);
		if (ch === 13 && source.charCodeAt(i + 1) === 10) i++;
		else if (ch !== 10 && ch !== 13 && ch !== 0x2028 && ch !== 0x2029) continue;
		line++;
		start = i + 1;
	}
	return { line, column: offset - start };
}

/** @param {unknown} value @param {TestNode[]} result @returns {TestNode[]} */
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

/** @param {string} source @param {unknown} program */
function checkLocations(source, program) {
	for (const node of nodes(program)) {
		if (!node.loc || typeof node.start !== 'number' || typeof node.end !== 'number') continue;
		for (const edge of /** @type {const} */ (['start', 'end'])) {
			assert.deepEqual(
				{ ...node.loc[edge] },
				position(source, edge === 'start' ? node.start : node.end),
				node.type + '.' + edge,
			);
		}
	}
}

for (const newline of ['\n', '\r', '\r\n', '\u2028', '\u2029']) {
	const label = JSON.stringify(newline);
	for (const prefix of ['', 'hello🚀', '<b/>']) {
		test(
			'template line comment ends and preserves following markup ' + label + ' ' + prefix,
			() => {
				const source =
					'function F() @{ <div>' + prefix + newline + '// note🚀' + newline + '<span/></div> }';
				/** @type {import('estree').CommentWithLocation[]} */
				const recorded = [];
				const program = parseModule(source, 'App.tsrx', { collect: true, comments: recorded });
				checkLocations(source, program);
				checkLocations(source, recorded);
				assert.equal(recorded.length, 1);
				assert.equal(recorded[0].value, ' note🚀');
				assert.equal(source.slice(recorded[0].start, recorded[0].end), '// note🚀');
				const all = nodes(program);
				assert.equal(all.filter((n) => n.type === 'JSXIdentifier' && n.name === 'span').length, 1);
				const comments = all.flatMap((n) => n.innerComments || []);
				for (const comment of comments) {
					assert.equal(comment.value, ' note🚀');
					assert.equal(source.slice(comment.start, comment.end), '// note🚀');
				}
			},
		);
	}
	for (const template of [false, true]) {
		test(
			'JSXText and subsequent tokens keep UTF-16 locations ' + label + ' template=' + template,
			() => {
				const first = 'a🚀' + newline + 'b';
				const second = 'c' + newline + 'd🚀';
				const element = '<div>' + first + '<span/>' + second + '</div>';
				const source = template
					? 'function F() @{ ' + element + ' }'
					: 'const view = ' + element + ';';
				const program = parseModule(source, 'App.tsrx');
				checkLocations(source, program);
				const texts = nodes(program).filter((n) => n.type === 'JSXText');
				assert.deepEqual(
					texts.map((n) => n.raw),
					[first, second],
				);
				assert.deepEqual(
					texts.map((n) => n.value),
					[first, second].map((value) => value.replace(/\r\n/g, '\n')),
				);
				for (const text of texts) {
					assert.equal(source.slice(text.start, text.end), text.raw);
				}
			},
		);
	}
	for (const tag of ['style', 'script']) {
		for (const closed of [false, true]) {
			test('raw ' + tag + ' locations and authored bytes ' + label + ' closed=' + closed, () => {
				const content =
					tag === 'style'
						? '/*🚀' + newline + 'x*/' + newline + '.a { color: red }'
						: '🚀' + newline + 'x' + newline + 'y';
				const source =
					'const view = <' +
					tag +
					'>' +
					content +
					(closed ? '</' + tag + '>; const after = 1;' : '');
				const program = parseModule(
					source,
					'App.tsrx',
					closed ? undefined : { loose: true, errors: [] },
				);
				checkLocations(source, program);
				const raw = nodes(program).find((n) =>
					tag === 'style'
						? n.type === 'JSXStyleElement'
						: n.type === 'JSXElement' && n.content !== undefined,
				);
				assert.ok(raw);
				assert.equal(tag === 'style' ? raw.css : raw.content, content);
				assert.ok(raw.children);
				if (tag === 'script' && raw.children.length) {
					assert.equal(raw.children[0].raw, content);
					assert.equal(raw.children[0].value, content);
				}
			});
		}
	}
}

for (const newline of ['\u2028', '\u2029']) {
	test('Unicode separators remain significant text ' + JSON.stringify(newline), () => {
		const source = 'const view = <div>' + newline + '</div>;';
		const program = parseModule(source, 'App.tsrx');
		const text = nodes(program).find((n) => n.type === 'JSXText');
		assert.ok(text);
		assert.equal(text.raw, newline);
		assert.equal(text.value, newline);
		checkLocations(source, program);
	});
}
